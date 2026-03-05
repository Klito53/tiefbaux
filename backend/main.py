from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
from io import BytesIO

app = FastAPI(title="TiefbauX API")

# Configure CORS to allow requests from the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"status": "ok", "app": "TiefbauX"}


@app.post("/analyze")
async def analyze_pdf(file: UploadFile = File(...)):
    # Check content type
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only PDF files (application/pdf) are allowed."
        )
    
    # Read file content
    contents = await file.read()
    
    # Extract text from PDF
    pdf_file = BytesIO(contents)
    reader = PdfReader(pdf_file)
    
    raw_text = ""
    for page in reader.pages:
        raw_text += page.extract_text() + "\n"
    
    # Split into lines and remove empty lines
    lines = [line.strip() for line in raw_text.split("\n") if line.strip()]
    
    return {
        "raw_text": raw_text.strip(),
        "lines": lines
    }

