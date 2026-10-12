import psycopg2
from psycopg2 import OperationalError
from psycopg2.extras import RealDictCursor
import pandas as pd
import streamlit as st

# ---------------------------------------------------------
# Page Configuration & Styling
# ---------------------------------------------------------
st.set_page_config(
    page_title="Streamlit + PostgreSQL App",
    page_icon="🐘",
    layout="wide",
)


# ---------------------------------------------------------
# Database Connection Logic (Streamlit Secrets)
# ---------------------------------------------------------
def get_db_connection():
    """Establishes and returns a database connection using Streamlit Secrets.
    
    Gracefully catches missing secrets or connection errors and displays an error message.
    """
    try:
        db_host = st.secrets["DB_HOST"]
        db_name = st.secrets["DB_NAME"]
        db_user = st.secrets["DB_USER"]
        db_password = st.secrets["DB_PASSWORD"]
        db_port = st.secrets["DB_PORT"]
    except KeyError as e:
        st.error(
            f"❌ Missing required secret {e} in Streamlit secrets configuration. "
            "Please configure your secrets in `.streamlit/secrets.toml` locally or in the Streamlit Cloud dashboard."
        )
        return None
    except Exception as e:
        st.error(f"❌ Failed to load Streamlit secrets: {e}")
        return None

    try:
        conn = psycopg2.connect(
            host=db_host,
            port=db_port,
            dbname=db_name,
            user=db_user,
            password=db_password,
            connect_timeout=10,
        )
        return conn
    except OperationalError as err:
        st.error(f"❌ Database connection failed: {err}")
        return None
    except Exception as err:
        st.error(f"❌ Unexpected database error: {err}")
        return None


def init_db():
    """Initializes the database table if it doesn't already exist."""
    conn = get_db_connection()
    if conn:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS records (
                        id SERIAL PRIMARY KEY,
                        title VARCHAR(150) NOT NULL,
                        category VARCHAR(50) NOT NULL,
                        notes TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                    """
                )
        conn.close()


def insert_record(title: str, category: str, notes: str):
    """Inserts a new record into the database."""
    conn = get_db_connection()
    if conn:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO records (title, category, notes)
                    VALUES (%s, %s, %s);
                    """,
                    (title, category, notes),
                )
        conn.close()
        return True
    return False


def fetch_records():
    """Fetches all records from the database ordered by newest first."""
    conn = get_db_connection()
    if conn:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, title, category, notes, created_at
                    FROM records
                    ORDER BY created_at DESC;
                    """
                )
                rows = cur.fetchall()
        conn.close()
        return rows
    return []


# Initialize schema on startup
init_db()

# ---------------------------------------------------------
# Streamlit UI
# ---------------------------------------------------------
st.title("🐘 Inventory & Records Manager")

# Display connection caption if secrets are present
if "DB_NAME" in st.secrets and "DB_HOST" in st.secrets:
    st.caption(f"Connected to database **{st.secrets['DB_NAME']}** on host **{st.secrets['DB_HOST']}**")

col_form, col_table = st.columns([1, 2], gap="large")

with col_form:
    st.subheader("➕ Add New Record")
    with st.form("entry_form", clear_on_submit=True):
        title = st.text_input("Title / Item Name", placeholder="e.g. Cloud Deployment Guide")
        category = st.selectbox(
            "Category",
            ["Engineering", "DevOps", "Operations", "Documentation", "Other"],
        )
        notes = st.text_area("Notes / Description", placeholder="Enter details or comments...")

        submitted = st.form_submit_button("Save Record", use_container_width=True)
        if submitted:
            if not title.strip():
                st.warning("⚠️ Title is required!")
            else:
                success = insert_record(title.strip(), category, notes.strip())
                if success:
                    st.success("✅ Record saved successfully!")
                    st.rerun()

with col_table:
    header_col, refresh_col = st.columns([3, 1])
    with header_col:
        st.subheader("📋 Existing Records")
    with refresh_col:
        if st.button("🔄 Refresh", use_container_width=True):
            st.rerun()

    data = fetch_records()
    if data:
        df = pd.DataFrame(data)
        df.rename(
            columns={
                "id": "ID",
                "title": "Title",
                "category": "Category",
                "notes": "Notes",
                "created_at": "Created At",
            },
            inplace=True,
        )
        st.dataframe(df, use_container_width=True, hide_index=True)
    else:
        st.info("No records found in the database. Use the form on the left to add one!")
