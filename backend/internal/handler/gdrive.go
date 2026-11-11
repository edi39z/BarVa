package handler

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"nas-backend/internal/auth"
	"nas-backend/internal/store"
)

// Scope "drive" penuh diperlukan agar aplikasi dapat melihat SELURUH isi Drive
// pengguna. Scope "drive.file" hanya memberi akses ke file yang dibuat/dibuka
// oleh aplikasi ini sendiri — itulah sebabnya daftar file tampak kosong.
const driveScope = "https://www.googleapis.com/auth/drive " +
	"https://www.googleapis.com/auth/userinfo.email"

type gdriveConfig struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	RedirectURI  string `json:"redirect_uri"`
	RefreshToken string `json:"refresh_token"`
	AccessToken  string `json:"access_token"`
	AccessExpiry int64  `json:"access_expiry"`
	Email        string `json:"email"`
	Scope        string `json:"scope"`
	ConnectedAt  string `json:"connected_at"`
}

type pendingAuth struct {
	Verifier  string
	Redirect  string
	CreatedAt time.Time
}

// GDriveHandler menangani OAuth Google Drive sepenuhnya di sisi server.
// Refresh token disimpan di sini, bukan di browser, sehingga akses tidak
// pernah kedaluwarsa selama pengguna tidak mencabutnya.
type GDriveHandler struct {
	store    *store.FileStore
	client   *http.Client
	mu       sync.Mutex
	pendings map[string]pendingAuth
	appURL   string
}

func NewGDriveHandler(cfgPath, appURL string) (*GDriveHandler, error) {
	st, err := store.New(cfgPath)
	if err != nil {
		return nil, err
	}
	return &GDriveHandler{
		store:    st,
		client:   &http.Client{Timeout: 30 * time.Second},
		pendings: make(map[string]pendingAuth),
		appURL:   strings.TrimRight(appURL, "/"),
	}, nil
}

func (h *GDriveHandler) load() (gdriveConfig, error) {
	var c gdriveConfig
	err := h.store.Load(&c)
	return c, err
}

// ---------- helpers ----------

// pkcePair membuat verifier dan challenge PKCE (S256). Verifier 32 byte
// base64url (43 karakter) memenuhi batas 43–128 karakter RFC 7636.
func pkcePair() (verifier, challenge string, err error) {
	verifier, err = auth.NewURLToken(auth.SessionTokenBytes)
	if err != nil {
		return "", "", err
	}
	sum := sha256.Sum256([]byte(verifier))
	return verifier, base64.RawURLEncoding.EncodeToString(sum[:]), nil
}

func scopeGranted(granted, want string) bool {
	for _, s := range strings.Fields(granted) {
		if s == want {
			return true
		}
	}
	return false
}

// accessToken mengembalikan access token yang masih valid, atau me-refresh
// memakai refresh token bila sudah kedaluwarsa (kurang dari 2 menit lagi).
func (h *GDriveHandler) accessToken() (string, error) {
	cfg, err := h.load()
	if err != nil {
		return "", err
	}
	if cfg.RefreshToken == "" {
		return "", fmt.Errorf("belum terhubung ke Google Drive")
	}
	if cfg.AccessToken != "" && time.Now().Unix() < cfg.AccessExpiry-120 {
		return cfg.AccessToken, nil
	}

	form := url.Values{}
	form.Set("client_id", cfg.ClientID)
	form.Set("client_secret", cfg.ClientSecret)
	form.Set("refresh_token", cfg.RefreshToken)
	form.Set("grant_type", "refresh_token")

	resp, err := h.client.PostForm("https://oauth2.googleapis.com/token", form)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("refresh gagal (%d): %s", resp.StatusCode, truncate(string(body), 300))
	}

	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		Scope       string `json:"scope"`
	}
	if err := json.Unmarshal(body, &tok); err != nil {
		return "", err
	}

	h.store.Update(&cfg, func() error {
		cfg.AccessToken = tok.AccessToken
		cfg.AccessExpiry = time.Now().Unix() + int64(tok.ExpiresIn)
		if tok.Scope != "" {
			cfg.Scope = tok.Scope
		}
		return nil
	})
	return tok.AccessToken, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// ---------- endpoints ----------

// Status -> GET /api/v1/gdrive/status
func (h *GDriveHandler) Status(c *gin.Context) {
	cfg, _ := h.load()
	connected := cfg.RefreshToken != ""
	c.JSON(http.StatusOK, gin.H{
		"has_client":   cfg.ClientID != "" && cfg.ClientSecret != "",
		"connected":    connected,
		"email":        cfg.Email,
		"scope":        cfg.Scope,
		"connected_at": cfg.ConnectedAt,
		"redirect_uri": cfg.RedirectURI,
		"token_valid":  cfg.AccessToken != "" && time.Now().Unix() < cfg.AccessExpiry,
		"expires_at":   cfg.AccessExpiry,
		"full_drive":   strings.Contains(cfg.Scope, "auth/drive") && !strings.Contains(cfg.Scope, "drive.file"),
		"server_time":  time.Now().Format(time.RFC3339),
	})
}

// SaveClient -> POST /api/v1/gdrive/client
// Menyimpan OAuth client milik pengguna. Cukup diisi SEKALI seumur pemasangan.
func (h *GDriveHandler) SaveClient(c *gin.Context) {
	var in struct {
		ClientID     string `json:"client_id"`
		ClientSecret string `json:"client_secret"`
		RedirectURI  string `json:"redirect_uri"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		fail(c, http.StatusBadRequest, "VALIDATION_ERROR", "Payload OAuth client tidak valid.")
		return
	}
	in.ClientID = strings.TrimSpace(in.ClientID)
	in.ClientSecret = strings.TrimSpace(in.ClientSecret)
	in.RedirectURI = strings.TrimSpace(in.RedirectURI)
	if in.ClientID == "" || in.ClientSecret == "" {
		fail(c, http.StatusBadRequest, "VALIDATION_ERROR", "client_id dan client_secret wajib diisi.")
		return
	}
	if in.RedirectURI == "" {
		in.RedirectURI = "http://localhost:8080/api/v1/gdrive/callback"
	}

	cfg, _ := h.load()
	cfg.ClientID = in.ClientID
	cfg.ClientSecret = in.ClientSecret
	cfg.RedirectURI = in.RedirectURI
	if err := h.store.Save(&cfg); err != nil {
		failInternal(c, err, "STORAGE_ERROR", "Gagal menyimpan kredensial Google Drive.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "redirect_uri": in.RedirectURI})
}

// AuthURL -> GET /api/v1/gdrive/auth-url
func (h *GDriveHandler) AuthURL(c *gin.Context) {
	cfg, _ := h.load()
	if cfg.ClientID == "" || cfg.ClientSecret == "" {
		failWithHint(c, http.StatusPreconditionRequired, "GDRIVE_NOT_CONFIGURED",
			"OAuth client Google Drive belum diatur.",
			"Kirim client_id & client_secret ke POST /api/v1/gdrive/client")
		return
	}
	redirect := c.Query("redirect_uri")
	if redirect == "" {
		redirect = cfg.RedirectURI
	}

	state, err := auth.NewURLToken(24)
	if err != nil {
		failInternal(c, err, "RANDOM_ERROR", "Gagal membuat state OAuth.")
		return
	}
	verifier, challenge, err := pkcePair()
	if err != nil {
		failInternal(c, err, "RANDOM_ERROR", "Gagal membuat verifier PKCE.")
		return
	}

	h.mu.Lock()
	// bersihkan state lama > 15 menit
	for k, v := range h.pendings {
		if time.Since(v.CreatedAt) > 15*time.Minute {
			delete(h.pendings, k)
		}
	}
	h.pendings[state] = pendingAuth{Verifier: verifier, Redirect: redirect, CreatedAt: time.Now()}
	h.mu.Unlock()

	q := url.Values{}
	q.Set("client_id", cfg.ClientID)
	q.Set("redirect_uri", redirect)
	q.Set("response_type", "code")
	q.Set("scope", driveScope)
	q.Set("access_type", "offline") // minta refresh token
	q.Set("prompt", "consent")      // paksa refresh token walau sudah pernah izin
	q.Set("include_granted_scopes", "true")
	q.Set("state", state)
	q.Set("code_challenge", challenge)
	q.Set("code_challenge_method", "S256")

	c.JSON(http.StatusOK, gin.H{
		"url":          "https://accounts.google.com/o/oauth2/v2/auth?" + q.Encode(),
		"redirect_uri": redirect,
		"scope":        driveScope,
	})
}

// Callback -> GET /api/v1/gdrive/callback
// Google mengarahkan browser pengguna ke sini setelah consent.
func (h *GDriveHandler) Callback(c *gin.Context) {
	if errCode := c.Query("error"); errCode != "" {
		h.redirectBack(c, "error", errCode)
		return
	}
	state := c.Query("state")
	code := c.Query("code")

	h.mu.Lock()
	pending, ok := h.pendings[state]
	delete(h.pendings, state)
	h.mu.Unlock()

	if !ok {
		h.redirectBack(c, "error", "state_tidak_valid")
		return
	}

	cfg, _ := h.load()

	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", cfg.ClientID)
	form.Set("client_secret", cfg.ClientSecret)
	form.Set("redirect_uri", pending.Redirect)
	form.Set("grant_type", "authorization_code")
	form.Set("code_verifier", pending.Verifier)

	resp, err := h.client.PostForm("https://oauth2.googleapis.com/token", form)
	if err != nil {
		h.redirectBack(c, "error", "jaringan")
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		h.redirectBack(c, "error", "tukar_kode_gagal")
		return
	}

	var tok struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		Scope        string `json:"scope"`
	}
	if err := json.Unmarshal(body, &tok); err != nil {
		h.redirectBack(c, "error", "respons_tidak_valid")
		return
	}

	// Google bisa mengembalikan token tanpa scope Drive (mis. scope belum
	// didaftarkan di consent screen atau centang izin dilepas pengguna).
	// Jangan simpan token seperti itu — fitur Drive tidak akan bekerja.
	if !scopeGranted(tok.Scope, "https://www.googleapis.com/auth/drive") {
		h.redirectBack(c, "error", "scope_drive_ditolak")
		return
	}

	cfg.AccessToken = tok.AccessToken
	cfg.AccessExpiry = time.Now().Unix() + int64(tok.ExpiresIn)
	cfg.Scope = tok.Scope
	if tok.RefreshToken != "" {
		cfg.RefreshToken = tok.RefreshToken
	}
	cfg.ConnectedAt = time.Now().Format(time.RFC3339)
	cfg.RedirectURI = pending.Redirect

	// Ambil email akun yang terhubung untuk ditampilkan di UI.
	if email := h.fetchEmail(tok.AccessToken); email != "" {
		cfg.Email = email
	}

	if err := h.store.Save(&cfg); err != nil {
		h.redirectBack(c, "error", "gagal_simpan")
		return
	}
	h.redirectBack(c, "connected", "")
}

func (h *GDriveHandler) redirectBack(c *gin.Context, key, val string) {
	target := h.appURL + "/?gdrive=" + key
	if val != "" {
		target += "&reason=" + url.QueryEscape(val)
	}
	c.Redirect(http.StatusFound, target)
}

func (h *GDriveHandler) fetchEmail(token string) string {
	req, _ := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := h.client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var u struct {
		Email string `json:"email"`
	}
	if json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return ""
	}
	return u.Email
}

// Quota -> GET /api/v1/gdrive/quota
func (h *GDriveHandler) Quota(c *gin.Context) {
	token, err := h.accessToken()
	if err != nil {
		failLogged(c, http.StatusUnauthorized, "GDRIVE_NOT_CONNECTED", "Google Drive belum terhubung atau token gagal diperbarui.", err)
		return
	}
	req, _ := http.NewRequest("GET", "https://www.googleapis.com/drive/v3/about?fields=user,storageQuota", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := h.client.Do(req)
	if err != nil {
		failLogged(c, http.StatusBadGateway, "UPSTREAM_ERROR", "Gagal menghubungi Google Drive.", err)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		failLogged(c, resp.StatusCode, "UPSTREAM_ERROR", "Google Drive menolak permintaan kuota.",
			fmt.Errorf("status %d: %s", resp.StatusCode, truncate(string(body), 400)))
		return
	}
	c.Data(http.StatusOK, "application/json", body)
}

// Files -> GET /api/v1/gdrive/files?q=&limit=&folder=
func (h *GDriveHandler) Files(c *gin.Context) {
	token, err := h.accessToken()
	if err != nil {
		failLogged(c, http.StatusUnauthorized, "GDRIVE_NOT_CONNECTED", "Google Drive belum terhubung atau token gagal diperbarui.", err)
		return
	}
	limit := c.DefaultQuery("limit", "50")
	folder := c.Query("folder")
	search := strings.TrimSpace(c.Query("q"))

	clauses := []string{"trashed = false"}
	if folder != "" {
		clauses = append(clauses, fmt.Sprintf("'%s' in parents", strings.ReplaceAll(folder, "'", "")))
	} else if search == "" {
		clauses = append(clauses, "'root' in parents")
	}
	if search != "" {
		clauses = append(clauses, fmt.Sprintf("name contains '%s'", strings.ReplaceAll(search, "'", "")))
	}

	q := url.Values{}
	q.Set("q", strings.Join(clauses, " and "))
	q.Set("pageSize", limit)
	q.Set("orderBy", "folder,name")
	q.Set("fields", "files(id,name,mimeType,size,modifiedTime,iconLink,thumbnailLink,webViewLink,parents)")
	q.Set("includeItemsFromAllDrives", "true")
	q.Set("supportsAllDrives", "true")

	req, _ := http.NewRequest("GET", "https://www.googleapis.com/drive/v3/files?"+q.Encode(), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := h.client.Do(req)
	if err != nil {
		failLogged(c, http.StatusBadGateway, "UPSTREAM_ERROR", "Gagal menghubungi Google Drive.", err)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		failLogged(c, resp.StatusCode, "UPSTREAM_ERROR", "Google Drive menolak permintaan daftar file.",
			fmt.Errorf("status %d: %s", resp.StatusCode, truncate(string(body), 400)))
		return
	}
	c.Data(http.StatusOK, "application/json", body)
}

// Download -> GET /api/v1/gdrive/file/:id/download
// Dialirkan lewat server agar browser tidak perlu memegang access token.
func (h *GDriveHandler) Download(c *gin.Context) {
	token, err := h.accessToken()
	if err != nil {
		failLogged(c, http.StatusUnauthorized, "GDRIVE_NOT_CONNECTED", "Google Drive belum terhubung atau token gagal diperbarui.", err)
		return
	}
	id := c.Param("id")

	req, _ := http.NewRequest("GET", "https://www.googleapis.com/drive/v3/files/"+id+"?alt=media", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := h.client.Do(req)
	if err != nil {
		failLogged(c, http.StatusBadGateway, "UPSTREAM_ERROR", "Gagal menghubungi Google Drive.", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		failLogged(c, resp.StatusCode, "UPSTREAM_ERROR", "Google Drive menolak unduhan file.",
			fmt.Errorf("status %d: %s", resp.StatusCode, truncate(string(body), 300)))
		return
	}

	c.Header("Content-Type", resp.Header.Get("Content-Type"))
	if cd := resp.Header.Get("Content-Disposition"); cd != "" {
		c.Header("Content-Disposition", cd)
	}
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		c.Header("Content-Length", cl)
	}
	c.Status(http.StatusOK)
	io.Copy(c.Writer, resp.Body)
}

// Upload -> POST /api/v1/gdrive/upload  (multipart: file, parent)
func (h *GDriveHandler) Upload(c *gin.Context) {
	token, err := h.accessToken()
	if err != nil {
		failLogged(c, http.StatusUnauthorized, "GDRIVE_NOT_CONNECTED", "Google Drive belum terhubung atau token gagal diperbarui.", err)
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		fail(c, http.StatusBadRequest, "FILE_REQUIRED", "File upload diperlukan.")
		return
	}
	parent := c.PostForm("parent")

	f, err := fh.Open()
	if err != nil {
		failInternal(c, err, "FILE_ERROR", "Gagal membuka file yang diunggah.")
		return
	}
	defer f.Close()

	meta := map[string]any{"name": fh.Filename}
	if parent != "" {
		meta["parents"] = []string{parent}
	}
	metaJSON, _ := json.Marshal(meta)

	// Multipart/related: metadata JSON + isi biner dalam satu request.
	pr, pw := io.Pipe()
	mw := newMultipartRelatedWriter(pw, "related", metaJSON, fh.Filename, fh.Header.Get("Content-Type"), f)
	go func() {
		mw.write()
		pw.Close()
	}()

	upURL := "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size"
	req, _ := http.NewRequest("POST", upURL, pr)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", mw.contentType())

	resp, err := h.client.Do(req)
	if err != nil {
		failLogged(c, http.StatusBadGateway, "UPSTREAM_ERROR", "Gagal menghubungi Google Drive.", err)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		failLogged(c, resp.StatusCode, "UPSTREAM_ERROR", "Google Drive menolak unggahan file.",
			fmt.Errorf("status %d: %s", resp.StatusCode, truncate(string(body), 400)))
		return
	}
	c.Data(resp.StatusCode, "application/json", body)
}

// Disconnect -> POST /api/v1/gdrive/disconnect
func (h *GDriveHandler) Disconnect(c *gin.Context) {
	cfg, _ := h.load()
	if cfg.RefreshToken != "" {
		form := url.Values{}
		form.Set("token", cfg.RefreshToken)
		if resp, err := h.client.PostForm("https://oauth2.googleapis.com/revoke", form); err == nil {
			resp.Body.Close()
		}
	}
	cfg.RefreshToken = ""
	cfg.AccessToken = ""
	cfg.AccessExpiry = 0
	cfg.Email = ""
	cfg.Scope = ""
	cfg.ConnectedAt = ""
	h.store.Save(&cfg)
	c.JSON(http.StatusOK, gin.H{"success": true})
}
