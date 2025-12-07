import sys
import os

# Add application to path
app_path = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, app_path)

# Import the FastAPI app
from src.main import app as fastapi_app

# WSGI wrapper for FastAPI (ASGI to WSGI conversion)
from a2wsgi import ASGIMiddleware

application = ASGIMiddleware(fastapi_app)
