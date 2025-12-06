from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import users, production, config

app = FastAPI(
    title="Production Tracker API",
    description="API for tracking worker production",
    version="1.0.0"
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://invitta-produkcja.onrender.com",
        "https://production-tracker-frontend.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(users.router)
app.include_router(production.router)
app.include_router(config.router)


@app.get("/health")
def health_check():
    return {"status": "healthy"}
