import json
import sqlite3

database_old = r"C:\Users\akinb\OneDrive - The Pennsylvania State University\Downloads\conversations.db"
database_new = r"C:\Users\akinb\Downloads\AGSI-main\AGSI-main\conversations2.db"


def _connect(db_path=database_new):
    """Open a SQLite connection that returns rows as dict-like objects."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def get_conversation(conversation_id, db_path=database_new):
    """Return the conversation row for the given id, or None if it doesn't exist.

    Example:
        get_conversation("a4c5a1b9-449e-440c-a2cf-003513b58787")
    """
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def conversation_exists(conversation_id, db_path=database_new):
    """Return True if a conversation with the given id exists in the database.

    Example:
        conversation_exists("a4c5a1b9-449e-440c-a2cf-003513b58787")
    """
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT 1 FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def get_messages(conversation_id, db_path=database_new):
    """Return all messages for a conversation, ordered chronologically.

    metadata_json is parsed into a Python object under the 'metadata' key.
    """
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            "SELECT * FROM messages WHERE conversation_id = ? "
            "ORDER BY timestamp ASC, id ASC",
            (conversation_id,),
        ).fetchall()
        messages = []
        for row in rows:
            message = dict(row)
            raw = message.get("metadata_json")
            try:
                message["metadata"] = json.loads(raw) if raw else None
            except (ValueError, TypeError):
                message["metadata"] = raw
            messages.append(message)
        return messages
    finally:
        conn.close()


def get_files(conversation_id, db_path=database_new):
    """Return the file records attached to a conversation."""
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            "SELECT * FROM conversation_files WHERE conversation_id = ? "
            "ORDER BY added_at ASC, id ASC",
            (conversation_id,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_collaborators(conversation_id, db_path=database_new):
    """Return the collaborator records for a conversation."""
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            "SELECT * FROM conversation_collaborators WHERE conversation_id = ? "
            "ORDER BY added_at ASC",
            (conversation_id,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_artifacts(task_id, db_path=database_new):
    """Return the artifacts linked to a task_id (conversations reference a task_id)."""
    if not task_id:
        return []
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            "SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at ASC",
            (task_id,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def list_conversations(user_id=None, limit=None, db_path=database_new):
    """Return all conversations, most recently updated first.

    Optionally filter by user_id and cap the number of rows with limit.

    Example:
        list_conversations()                      # everything
        list_conversations(user_id="71fd3c13...") # one user's conversations
        list_conversations(limit=10)              # 10 most recent
    """
    conn = _connect(db_path)
    try:
        query = "SELECT * FROM conversations"
        params = []
        if user_id is not None:
            query += " WHERE user_id = ?"
            params.append(user_id)
        query += " ORDER BY updated_at DESC"
        if limit is not None:
            query += " LIMIT ?"
            params.append(limit)
        rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_conversation_info(conversation_id, db_path=database_new):
    """Return a full bundle of info for a conversation.

    Combines the conversation metadata, its messages, attached files,
    collaborators, and any artifacts tied to its task_id.
    Returns None if the conversation does not exist.

    Example:
        info = get_conversation_info("a4c5a1b9-449e-440c-a2cf-003513b58787")
    """
    conversation = get_conversation(conversation_id, db_path)
    if conversation is None:
        return None

    messages = get_messages(conversation_id, db_path)
    return {
        "conversation": conversation,
        "messages": messages,
        "message_count": len(messages),
        "files": get_files(conversation_id, db_path),
        "collaborators": get_collaborators(conversation_id, db_path),
        "artifacts": get_artifacts(conversation.get("task_id"), db_path),
    }


def _table_exists(conn, table):
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?", (table,)
    ).fetchone() is not None


def _copy_rows(src_conn, dst_conn, table, where_sql, params, mode="OR IGNORE",
               drop_id=True):
    """Copy rows of one table from src to dst, returning how many were inserted.

    drop_id=True omits the autoincrement 'id' column so the destination
    assigns fresh ids (avoids primary-key clashes across databases).
    """
    if not _table_exists(src_conn, table) or not _table_exists(dst_conn, table):
        return 0

    rows = src_conn.execute(
        f"SELECT * FROM {table} WHERE {where_sql}", params
    ).fetchall()
    if not rows:
        return 0

    columns = [c for c in rows[0].keys() if not (drop_id and c == "id")]
    placeholders = ", ".join("?" for _ in columns)
    col_sql = ", ".join(columns)
    insert_sql = (
        f"INSERT {mode} INTO {table} ({col_sql}) VALUES ({placeholders})"
    )
    dst_conn.executemany(
        insert_sql, [[row[c] for c in columns] for row in rows]
    )
    return len(rows)


def copy_conversation(conversation_id, src_db, dst_db, overwrite=False):
    """Copy a conversation and all its related data from one database to another.

    Copies the conversation row plus its messages, files, file blobs,
    collaborators, and any artifacts tied to its task_id.

    Args:
        conversation_id: id of the conversation to copy.
        src_db: path to the source database.
        dst_db: path to the destination database.
        overwrite: if True, replace the conversation in the destination
            (and its child rows) when it already exists. If False and the
            conversation already exists, raises ValueError.

    Returns a dict summarizing how many rows were copied per table.

    Example:
        copy_conversation("a4c5a1b9-...", database_old, database_new)
    """
    src_conn = _connect(src_db)
    dst_conn = _connect(dst_db)
    try:
        conv = src_conn.execute(
            "SELECT * FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        if conv is None:
            raise ValueError(
                f"Conversation {conversation_id} not found in source database."
            )

        exists = dst_conn.execute(
            "SELECT 1 FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone() is not None
        if exists and not overwrite:
            raise ValueError(
                f"Conversation {conversation_id} already exists in destination. "
                "Pass overwrite=True to replace it."
            )

        dst_conn.execute("PRAGMA foreign_keys = ON")
        with dst_conn:  # single transaction; rolls back on error
            if exists:
                # Remove existing children first, then the conversation itself.
                for table in ("messages", "conversation_files", "file_blobs",
                              "conversation_collaborators"):
                    if _table_exists(dst_conn, table):
                        dst_conn.execute(
                            f"DELETE FROM {table} WHERE conversation_id = ?",
                            (conversation_id,),
                        )
                if conv["task_id"] and _table_exists(dst_conn, "artifacts"):
                    dst_conn.execute(
                        "DELETE FROM artifacts WHERE task_id = ?",
                        (conv["task_id"],),
                    )
                dst_conn.execute(
                    "DELETE FROM conversations WHERE id = ?", (conversation_id,)
                )

            summary = {}
            # The conversation row keeps its own id (it's the natural key).
            summary["conversations"] = _copy_rows(
                src_conn, dst_conn, "conversations",
                "id = ?", (conversation_id,), mode="OR REPLACE", drop_id=False,
            )
            for table in ("messages", "conversation_files", "file_blobs",
                          "conversation_collaborators"):
                summary[table] = _copy_rows(
                    src_conn, dst_conn, table,
                    "conversation_id = ?", (conversation_id,),
                )
            summary["artifacts"] = (
                _copy_rows(
                    src_conn, dst_conn, "artifacts",
                    "task_id = ?", (conv["task_id"],),
                )
                if conv["task_id"] else 0
            )
        return summary
    finally:
        src_conn.close()
        dst_conn.close()


if __name__ == "__main__":
    # Quick manual check: print a summary for a given conversation id.
    import sys

    conv_id = sys.argv[1] if len(sys.argv) > 1 else "a4c5a1b9-449e-440c-a2cf-003513b58787"
    info = get_conversation_info(conv_id)
    if info is None:
        print(f"No conversation found with id: {conv_id}")
    else:
        conv = info["conversation"]
        print(f"Title:      {conv['title']}")
        print(f"Created:    {conv['created_at']}")
        print(f"Updated:    {conv['updated_at']}")
        print(f"Task ID:    {conv.get('task_id')}")
        print(f"User ID:    {conv.get('user_id')}")
        print(f"Messages:   {info['message_count']}")
        print(f"Files:      {len(info['files'])}")
        print(f"Artifacts:  {len(info['artifacts'])}")
