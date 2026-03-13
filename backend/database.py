import aiosqlite
from config import DB_PATH

async def get_db():
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    try:
        yield db
    finally:
        await db.close()


async def init_db():
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA foreign_keys=ON")

        await db.executescript("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                hint TEXT,
                topic TEXT,
                task_type TEXT DEFAULT 'essay',
                question_data TEXT DEFAULT '{}',
                points INTEGER DEFAULT 1,
                parent_task_id INTEGER,
                source TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
            );

            CREATE TABLE IF NOT EXISTS exams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                class_name TEXT,
                date TEXT,
                duration_minutes INTEGER,
                status TEXT DEFAULT 'draft',
                show_results_immediately BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS exam_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER NOT NULL,
                task_id INTEGER NOT NULL,
                position INTEGER NOT NULL,
                FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
                FOREIGN KEY (task_id) REFERENCES tasks(id)
            );

            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                class_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS exam_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER NOT NULL,
                student_id INTEGER NOT NULL,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                submitted_at TIMESTAMP,
                status TEXT DEFAULT 'in_progress',
                total_points REAL,
                max_points INTEGER,
                FOREIGN KEY (exam_id) REFERENCES exams(id),
                FOREIGN KEY (student_id) REFERENCES students(id)
            );

            CREATE TABLE IF NOT EXISTS answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                task_id INTEGER NOT NULL,
                student_answer TEXT,
                simulated_output TEXT,
                points_awarded REAL,
                is_correct BOOLEAN,
                feedback TEXT,
                graded_at TIMESTAMP,
                manually_adjusted BOOLEAN DEFAULT FALSE,
                disputed BOOLEAN DEFAULT FALSE,
                dispute_reason TEXT,
                FOREIGN KEY (session_id) REFERENCES exam_sessions(id),
                FOREIGN KEY (task_id) REFERENCES tasks(id)
            );
        """)

        # Migration: add disputed columns if they don't exist
        try:
            await db.execute("ALTER TABLE answers ADD COLUMN disputed BOOLEAN DEFAULT FALSE")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE answers ADD COLUMN dispute_reason TEXT")
        except Exception:
            pass

        # Migration: add question_data column and remap old task_type values
        try:
            await db.execute("ALTER TABLE tasks ADD COLUMN question_data TEXT DEFAULT '{}'")
        except Exception:
            pass
        await db.execute(
            "UPDATE tasks SET task_type = 'essay' WHERE task_type IN ('command', 'explanation', 'mixed')"
        )

        # Migration: task pools
        await db.execute("""
            CREATE TABLE IF NOT EXISTS task_pools (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        try:
            await db.execute("ALTER TABLE tasks ADD COLUMN pool_id INTEGER REFERENCES task_pools(id) ON DELETE CASCADE")
        except Exception:
            pass

        # Ensure a default pool exists and assign orphaned tasks
        cursor = await db.execute("SELECT id FROM task_pools LIMIT 1")
        default_pool = await cursor.fetchone()
        if not default_pool:
            cursor = await db.execute("INSERT INTO task_pools (name) VALUES ('Allgemein')")
            default_pool_id = cursor.lastrowid
        else:
            default_pool_id = default_pool[0]
        await db.execute("UPDATE tasks SET pool_id = ? WHERE pool_id IS NULL", (default_pool_id,))

        await db.commit()
