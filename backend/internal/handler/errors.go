package handler

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// apiError adalah isi field "error" pada setiap respons gagal. Bentuknya
// dikunci di satu tempat supaya kontrak di documentation/API.md tidak
// menyimpang dari kenyataan.
type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Hint    string `json:"hint,omitempty"`
}

// fail mengirim respons error sesuai kontrak API dan menghentikan rantai
// handler.
func fail(c *gin.Context, status int, code, message string) {
	failWithHint(c, status, code, message, "")
}

// failWithHint sama seperti fail, ditambah petunjuk perbaikan opsional untuk
// error yang bisa ditindaklanjuti operator (mis. kredensial belum diatur).
func failWithHint(c *gin.Context, status int, code, message, hint string) {
	c.AbortWithStatusJSON(status, gin.H{"error": apiError{
		Code:    code,
		Message: message,
		Hint:    hint,
	}})
}

// failInternal mencatat error asli ke log server lalu mengirim pesan generik.
// Dipakai untuk kegagalan 500: detail internal (nama tabel, path disk,
// respons upstream) tidak boleh sampai ke klien.
func failInternal(c *gin.Context, err error, code, message string) {
	failLogged(c, http.StatusInternalServerError, code, message, err)
}

// failLogged seperti fail, tetapi mencatat error asli lebih dulu. Dipakai bila
// status bukan 500 (mis. 502 dari upstream) namun detailnya tetap internal.
func failLogged(c *gin.Context, status int, code, message string, err error) {
	if err != nil {
		log.Printf("[api] %s: %v", code, err)
	}
	fail(c, status, code, message)
}
