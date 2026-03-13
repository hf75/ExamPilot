from fastapi import APIRouter, Depends, HTTPException
import aiosqlite

from database import get_db
from models import PoolCreate, PoolUpdate, PoolOut
from routers.auth import require_teacher

router = APIRouter(prefix="/api/pools", tags=["pools"])


@router.get("", response_model=list[PoolOut])
async def list_pools(
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute(
        """SELECT p.*, COUNT(t.id) as task_count
           FROM task_pools p
           LEFT JOIN tasks t ON t.pool_id = p.id
           GROUP BY p.id
           ORDER BY p.created_at"""
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.post("", response_model=PoolOut)
async def create_pool(
    pool: PoolCreate,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    cursor = await db.execute(
        "INSERT INTO task_pools (name) VALUES (?)", (pool.name,)
    )
    await db.commit()
    pool_id = cursor.lastrowid
    cursor = await db.execute(
        """SELECT p.*, COUNT(t.id) as task_count
           FROM task_pools p
           LEFT JOIN tasks t ON t.pool_id = p.id
           WHERE p.id = ?
           GROUP BY p.id""",
        (pool_id,),
    )
    row = await cursor.fetchone()
    return dict(row)


@router.put("/{pool_id}", response_model=PoolOut)
async def update_pool(
    pool_id: int,
    pool: PoolUpdate,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    await db.execute(
        "UPDATE task_pools SET name = ? WHERE id = ?", (pool.name, pool_id)
    )
    await db.commit()
    cursor = await db.execute(
        """SELECT p.*, COUNT(t.id) as task_count
           FROM task_pools p
           LEFT JOIN tasks t ON t.pool_id = p.id
           WHERE p.id = ?
           GROUP BY p.id""",
        (pool_id,),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Pool nicht gefunden")
    return dict(row)


@router.delete("/{pool_id}")
async def delete_pool(
    pool_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    _: bool = Depends(require_teacher),
):
    # Prevent deleting the last pool
    cursor = await db.execute("SELECT COUNT(*) FROM task_pools")
    count = (await cursor.fetchone())[0]
    if count <= 1:
        raise HTTPException(status_code=400, detail="Der letzte Pool kann nicht gelöscht werden")

    cursor = await db.execute("SELECT id FROM task_pools WHERE id = ?", (pool_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Pool nicht gefunden")

    # Tasks are deleted via ON DELETE CASCADE
    await db.execute("DELETE FROM task_pools WHERE id = ?", (pool_id,))
    await db.commit()
    return {"message": "Pool gelöscht"}
