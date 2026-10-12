import asyncio
import sys
from app.core.database import AsyncSessionLocal

async def check():
    try:
        async with AsyncSessionLocal() as session:
            # just execute something simple
            from sqlalchemy import text
            await session.execute(text("SELECT 1"))
            print("DB_SUCCESS")
    except Exception as e:
        print(f"DB_ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(check())
