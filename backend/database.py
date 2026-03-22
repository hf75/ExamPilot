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
                password TEXT,
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

        # Helper to check if a column exists
        async def has_column(table, column):
            cursor = await db.execute(f"PRAGMA table_info({table})")
            columns = {row[1] for row in await cursor.fetchall()}
            return column in columns

        # Migration: add disputed columns
        if not await has_column("answers", "disputed"):
            await db.execute("ALTER TABLE answers ADD COLUMN disputed BOOLEAN DEFAULT FALSE")
        if not await has_column("answers", "dispute_reason"):
            await db.execute("ALTER TABLE answers ADD COLUMN dispute_reason TEXT")

        # Migration: solution (Musterlösung) field for tasks
        if not await has_column("tasks", "solution"):
            await db.execute("ALTER TABLE tasks ADD COLUMN solution TEXT DEFAULT ''")

        # Migration: grading_status for async AI grading
        if not await has_column("answers", "grading_status"):
            await db.execute("ALTER TABLE answers ADD COLUMN grading_status TEXT")

        # Migration: add question_data column and remap old task_type values
        if not await has_column("tasks", "question_data"):
            await db.execute("ALTER TABLE tasks ADD COLUMN question_data TEXT DEFAULT '{}'")
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
        if not await has_column("tasks", "pool_id"):
            await db.execute("ALTER TABLE tasks ADD COLUMN pool_id INTEGER REFERENCES task_pools(id) ON DELETE CASCADE")

        # Migration: optional password for exams
        if not await has_column("exams", "password"):
            await db.execute("ALTER TABLE exams ADD COLUMN password TEXT")

        # Ensure a default pool exists and assign orphaned tasks
        cursor = await db.execute("SELECT id FROM task_pools LIMIT 1")
        default_pool = await cursor.fetchone()
        if not default_pool:
            cursor = await db.execute("INSERT INTO task_pools (name) VALUES ('Allgemein')")
            default_pool_id = cursor.lastrowid
        else:
            default_pool_id = default_pool[0]
        await db.execute("UPDATE tasks SET pool_id = ? WHERE pool_id IS NULL", (default_pool_id,))

        # Migration: shuffle_tasks option for exams
        if not await has_column("exams", "shuffle_tasks"):
            await db.execute("ALTER TABLE exams ADD COLUMN shuffle_tasks BOOLEAN DEFAULT FALSE")

        # Migration: custom grading scale per exam (JSON)
        if not await has_column("exams", "grading_scale"):
            await db.execute("ALTER TABLE exams ADD COLUMN grading_scale TEXT")

        # Migration: class analysis cache
        await db.execute("""
            CREATE TABLE IF NOT EXISTS class_analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER NOT NULL UNIQUE,
                analysis_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
            )
        """)

        # Indexes on foreign keys for query performance
        await db.execute("CREATE INDEX IF NOT EXISTS idx_exam_sessions_exam_id ON exam_sessions(exam_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_exam_sessions_student_id ON exam_sessions(student_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_answers_session_id ON answers(session_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_answers_task_id ON answers(task_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_exam_tasks_exam_id ON exam_tasks(exam_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_exam_tasks_task_id ON exam_tasks(task_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_tasks_pool_id ON tasks(pool_id)")

        await db.commit()
