import asyncio
import logging
from typing import Dict, Any, List
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # A list of active websockets
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Active clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"Client disconnected. Active clients: {len(self.active_connections)}")

    async def broadcast(self, message: Dict[str, Any]):
        """
        Broadcast a message to all connected clients.
        Handles slow consumers by dropping messages if the queue is full or sending times out.
        """
        if not self.active_connections:
            return

        # Prepare normalized envelope if missing
        if "schema_version" not in message:
            message["schema_version"] = 1
        if "server_timestamp" not in message:
            message["server_timestamp"] = datetime.now(timezone.utc).isoformat()

        # Gather tasks to send messages concurrently
        tasks = []
        for connection in self.active_connections:
            tasks.append(self._send_with_timeout(connection, message))
        
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _send_with_timeout(self, websocket: WebSocket, message: Dict[str, Any]):
        try:
            # Prevent blocking ingestion if a client is slow
            async with asyncio.timeout(0.5):
                await websocket.send_json(message)
        except asyncio.TimeoutError:
            logger.warning("Slow consumer detected. Dropping message.")
        except WebSocketDisconnect:
            self.disconnect(websocket)
        except Exception as e:
            logger.error(f"Error sending message to client: {e}")
            self.disconnect(websocket)

ws_manager = ConnectionManager()
