import pytest
from httpx import AsyncClient, ASGITransport
from app.core.config import Settings
from app.main import app

def test_database_url_normalization():
    # Test Render / Cloud standard mysql:// prefix normalization
    s1 = Settings(DATABASE_URL="mysql://usr:pwd@remote-db.host.com:3306/production_db")
    assert s1.database_url == "mysql+aiomysql://usr:pwd@remote-db.host.com:3306/production_db"

    # Test mysql2:// normalization
    s2 = Settings(DATABASE_URL="mysql2://usr:pwd@remote-db.host.com:3306/production_db")
    assert s2.database_url == "mysql+aiomysql://usr:pwd@remote-db.host.com:3306/production_db"

    # Test direct mysql+aiomysql:// pass-through
    s3 = Settings(DATABASE_URL="mysql+aiomysql://usr:pwd@remote-db.host.com:3306/production_db")
    assert s3.database_url == "mysql+aiomysql://usr:pwd@remote-db.host.com:3306/production_db"

    # Test local individual parameters fallback
    s4 = Settings(DATABASE_URL=None, db_user="dev", db_password="secret*password", db_host="127.0.0.1", db_port=3307, db_name="test_db")
    assert "mysql+aiomysql://dev:secret%2Apassword@127.0.0.1:3307/test_db" in s4.database_url

def test_cors_origins_parsing():
    s = Settings(cors_origins="https://my-app.vercel.app, http://localhost:5173, https://custom-domain.com")
    allowed = s.allowed_cors_origins
    assert "https://my-app.vercel.app" in allowed
    assert "http://localhost:5173" in allowed
    assert "https://custom-domain.com" in allowed
    assert len(allowed) == 3

    # Test wildcard
    s_wild = Settings(cors_origins="*")
    assert s_wild.allowed_cors_origins == ["*"]

def test_enable_serial_ingestion_flag():
    s_cloud = Settings(enable_serial_ingestion=False)
    assert s_cloud.enable_serial_ingestion is False

    s_local = Settings(enable_serial_ingestion=True)
    assert s_local.enable_serial_ingestion is True

@pytest.mark.asyncio
async def test_health_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res_root = await ac.get("/")
        assert res_root.status_code == 200
        data_root = res_root.json()
        assert data_root["status"] == "ok"
        assert data_root["service"] == "APEX_BLACKBOX_BACKEND"

        res_healthz = await ac.get("/healthz")
        assert res_healthz.status_code == 200
        data_healthz = res_healthz.json()
        assert data_healthz["status"] == "ok"
