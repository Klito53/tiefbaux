import { useState } from 'react'

function PdfUpload() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [message, setMessage] = useState('')

  const handleFileChange = (event) => {
    const file = event.target.files[0]
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file)
      setMessage('')
    } else {
      setSelectedFile(null)
      setMessage('Bitte wählen Sie eine PDF-Datei aus.')
    }
  }

  const handleSubmit = async () => {
    if (!selectedFile) {
      setMessage('Bitte wählen Sie zuerst eine PDF-Datei aus.')
      return
    }

    setIsUploading(true)
    setMessage('')

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch('http://localhost:8000/analyze', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        setMessage('Analyse erfolgreich gestartet!')
        setSelectedFile(null)
        // Reset file input
        document.getElementById('pdf-input').value = ''
      } else {
        setMessage('Fehler beim Hochladen der Datei.')
      }
    } catch (error) {
      setMessage('Fehler beim Hochladen der Datei: ' + error.message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">LV hochladen</h2>
      
      <div className="space-y-4">
        <div>
          <label
            htmlFor="pdf-input"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            PDF-Datei auswählen
          </label>
          <input
            id="pdf-input"
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100
              cursor-pointer"
          />
        </div>

        {selectedFile && (
          <div className="text-sm text-gray-600">
            Ausgewählte Datei: <span className="font-medium">{selectedFile.name}</span>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!selectedFile || isUploading}
          className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg
            hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed
            transition-colors duration-200"
        >
          {isUploading ? 'Wird hochgeladen...' : 'Analyse starten'}
        </button>

        {message && (
          <div
            className={`p-3 rounded-md text-sm ${
              message.includes('Fehler') || message.includes('Bitte')
                ? 'bg-red-50 text-red-700'
                : 'bg-green-50 text-green-700'
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  )
}

export default PdfUpload

