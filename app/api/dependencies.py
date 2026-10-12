from fastapi import Header, HTTPException, Depends
from typing import Optional
from app.core.config import settings
from app.core.database import AsyncSessionLocal

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def verify_api_key(x_api_key: Optional[str] = Header(None)):
    if x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    return x_api_key
