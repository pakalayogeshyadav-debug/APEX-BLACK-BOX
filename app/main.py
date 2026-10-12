from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.endpoints import router as api_router
from app.core.config import settings
from app.services.ingestion import ingestion_service
from app.services.serial_manager import serial_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    loop = asyncio.get_running_loop()
    if settings.enable_serial_ingestion:
        serial_manager.set_loop(loop)
    ingestion_service.start()
    yield
    # Shutdown
    await ingestion_service.stop()
    if settings.enable_serial_ingestion:
        serial_manager.shutdown()

app = FastAPI(title="APEX BLACKBOX", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.core.database import AsyncSessionLocal
import asyncio

@app.get("/")
@app.get("/healthz")
async def root_health_check():
    """Lightweight root healthcheck endpoint for cloud platforms (Render, Railway, etc.)."""
    return {
        "status": "ok",
        "service": "APEX_BLACKBOX_BACKEND",
        "version": "1.0.0"
    }

@app.get("/api/v1/health")
async def health_check():
    backend_status = "ONLINE"
    db_status = "DISCONNECTED"
    query_status = "FAILED"
    error_detail = None

    try:
        async with asyncio.timeout(2.0):
            async with AsyncSessionLocal() as session:
                res = await session.execute(text("SELECT 1"))
                if res.scalar() == 1:
                    db_status = "CONNECTED"
                    query_status = "OK"
    except asyncio.TimeoutError:
        error_detail = "Database query timed out (exceeded 2.0s limit)"
    except Exception:
        error_detail = "Database connectivity or query execution failed"

    is_healthy = (db_status == "CONNECTED" and query_status == "OK")
    status_code = 200 if is_healthy else 503

    content = {
        "status": "ok" if is_healthy else "degraded",
        "service": "APEX_BLACKBOX_BACKEND",
        "backend_process": {
            "status": backend_status
        },
        "database": {
            "engine": "MySQL",
            "status": db_status,
            "query": query_status,
            "detail": error_detail
        }
    }
    return JSONResponse(status_code=status_code, content=content)

app.include_router(api_router, prefix="/api/v1")
