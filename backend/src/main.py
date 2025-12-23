import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import SessionLocal
from .routers import users, orders, products, actions, sync, stats, costs
from .services.baselinker import sync_orders

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Background scheduler for periodic sync
scheduler = BackgroundScheduler()


def run_sync_job():
    """Background job to sync orders from Baselinker."""
    logger.info("Starting scheduled Baselinker sync...")
    db = SessionLocal()
    try:
        result = sync_orders(db)
        logger.info(f"Scheduled sync complete: {result}")
    except Exception as e:
        logger.exception(f"Scheduled sync failed: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    # Startup
    if settings.baselinker_api_token:
        scheduler.add_job(
            run_sync_job,
            "interval",
            minutes=settings.sync_interval_minutes,
            id="baselinker_sync",
            replace_existing=True,
        )
        scheduler.start()
        logger.info(f"Baselinker sync scheduler started (every {settings.sync_interval_minutes} minutes)")
    else:
        logger.warning("BASELINKER_API_TOKEN not set, automatic sync disabled")

    yield

    # Shutdown
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler shut down")


app = FastAPI(
    title="Production Tracker API",
    description="API for tracking order-based production",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://invitta-produkcja.onrender.com",
        "https://production-tracker-frontend.onrender.com",
        "https://produkcja.invitta.pl",
        "http://produkcja.invitta.pl",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(users.router)
app.include_router(orders.router)
app.include_router(products.router)
app.include_router(actions.router)
app.include_router(sync.router)
app.include_router(stats.router)
app.include_router(costs.router)


@app.get("/health")
def health_check():
    return {"status": "healthy", "version": "2.0.0"}
