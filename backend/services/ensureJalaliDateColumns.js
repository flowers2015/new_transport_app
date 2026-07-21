const pool = require('../db');

let ensurePromise = null;

async function getColumnDataType(tableName, columnName) {
  const { rows } = await pool.query(
    `
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName]
  );
  return rows[0]?.data_type ? String(rows[0].data_type).toLowerCase() : null;
}

function isTextLikeType(dataType) {
  return Boolean(dataType && (dataType.includes('character') || dataType === 'text'));
}

/**
 * ویوهایی که مستقیماً به ستون جدول وابسته‌اند + ویوهایی که به آن ویوها وابسته‌اند.
 */
async function collectDependentViews(tableName, columnNames) {
  const { rows: directRows } = await pool.query(
    `
      SELECT DISTINCT c.relname AS view_name
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid
      JOIN pg_class c ON c.oid = r.ev_class AND c.relkind = 'v'
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid AND NOT a.attisdropped
      JOIN pg_class t ON t.oid = d.refobjid
      WHERE t.relname = $1
        AND a.attname = ANY($2::text[])
        AND d.deptype IN ('n', 'a')
    `,
    [tableName, columnNames]
  );

  const viewMap = new Map();
  const queue = directRows.map((row) => row.view_name);

  while (queue.length > 0) {
    const viewName = queue.shift();
    if (viewMap.has(viewName)) continue;

    const defResult = await pool.query(
      `SELECT pg_get_viewdef($1::regclass, true) AS definition`,
      [viewName]
    );
    if (!defResult.rows[0]?.definition) continue;

    viewMap.set(viewName, defResult.rows[0].definition);

    const { rows: childViews } = await pool.query(
      `
        SELECT DISTINCT child.relname AS view_name
        FROM pg_depend d
        JOIN pg_rewrite r ON r.oid = d.objid
        JOIN pg_class child ON child.oid = r.ev_class AND child.relkind = 'v'
        JOIN pg_namespace n ON n.oid = child.relnamespace AND n.nspname = 'public'
        WHERE d.refobjid = $1::regclass
          AND d.deptype IN ('n', 'a')
      `,
      [viewName]
    );

    for (const row of childViews) {
      if (!viewMap.has(row.view_name)) queue.push(row.view_name);
    }
  }

  return viewMap;
}

async function getViewDependencyEdges(viewNames) {
  if (viewNames.length === 0) return [];

  const { rows } = await pool.query(
    `
      SELECT DISTINCT child.relname AS child_view, parent.relname AS parent_view
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid
      JOIN pg_class child ON child.oid = r.ev_class AND child.relkind = 'v'
      JOIN pg_class parent ON parent.oid = d.refobjid AND parent.relkind = 'v'
      JOIN pg_namespace n ON n.oid = child.relnamespace AND n.nspname = 'public'
      WHERE child.relname = ANY($1::text[])
        AND parent.relname = ANY($1::text[])
        AND d.deptype IN ('n', 'a')
    `,
    [viewNames]
  );

  return rows;
}

function sortViewsForCreate(viewMap, edges) {
  const viewNames = [...viewMap.keys()];
  const inDegree = new Map(viewNames.map((name) => [name, 0]));
  const children = new Map(viewNames.map((name) => [name, []]));

  for (const edge of edges) {
    if (!inDegree.has(edge.child_view) || !inDegree.has(edge.parent_view)) continue;
    inDegree.set(edge.child_view, (inDegree.get(edge.child_view) || 0) + 1);
    children.get(edge.parent_view).push(edge.child_view);
  }

  const queue = viewNames.filter((name) => (inDegree.get(name) || 0) === 0);
  const ordered = [];

  while (queue.length > 0) {
    const current = queue.shift();
    ordered.push(current);
    for (const child of children.get(current) || []) {
      const nextDegree = (inDegree.get(child) || 0) - 1;
      inDegree.set(child, nextDegree);
      if (nextDegree === 0) queue.push(child);
    }
  }

  return ordered.length === viewNames.length ? ordered : viewNames;
}

async function dropViews(viewMap) {
  if (viewMap.size === 0) return;

  const viewNames = [...viewMap.keys()];
  const edges = await getViewDependencyEdges(viewNames);
  const dropOrder = [...sortViewsForCreate(viewMap, edges)].reverse();

  for (const viewName of dropOrder) {
    await pool.query(`DROP VIEW IF EXISTS "${viewName}" CASCADE`);
    console.log(`🗑️ [ensureJalaliDateColumns] dropped view ${viewName}`);
  }
}

async function recreateViews(viewMap) {
  if (viewMap.size === 0) return;

  const viewNames = [...viewMap.keys()];
  const edges = await getViewDependencyEdges(viewNames);
  const createOrder = sortViewsForCreate(viewMap, edges);

  for (const viewName of createOrder) {
    const definition = viewMap.get(viewName);
    await pool.query(`CREATE OR REPLACE VIEW "${viewName}" AS ${definition}`);
    console.log(`✅ [ensureJalaliDateColumns] recreated view ${viewName}`);
  }

  const { rows: roleRows } = await pool.query(
    `SELECT 1 FROM pg_roles WHERE rolname = 'metabase_reader' LIMIT 1`
  );
  if (roleRows.length > 0) {
    for (const viewName of viewNames) {
      await pool.query(`GRANT SELECT ON "${viewName}" TO metabase_reader`);
    }
  }
}

const JALALI_DATE_COLUMNS = [
  { table: 'freight_announcements', column: 'loading_date', length: 255 },
  { table: 'freight_announcements', column: 'delivery_date', length: 32 },
  { table: 'freight_destinations', column: 'delivery_date', length: 32 },
];

/**
 * تاریخ‌های شمسی باید VARCHAR باشند — اگر DATE بمانند Postgres خطای out of range می‌دهد.
 * ویوهای Metabase (مثل v_freight_report) قبل از ALTER موقتاً حذف و بعد بازسازی می‌شوند.
 */
async function ensureJalaliDateColumns() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      try {
        const columnsToFix = [];
        for (const spec of JALALI_DATE_COLUMNS) {
          const dataType = await getColumnDataType(spec.table, spec.column);
          if (dataType && !isTextLikeType(dataType)) {
            columnsToFix.push(spec);
          }
        }

        if (columnsToFix.length === 0) {
          console.log('ℹ️ [ensureJalaliDateColumns] all jalali date columns already VARCHAR');
          return;
        }

        const savedViews = new Map();
        for (const spec of columnsToFix) {
          const dependentViews = await collectDependentViews(spec.table, [spec.column]);
          for (const [name, definition] of dependentViews.entries()) {
            if (!savedViews.has(name)) savedViews.set(name, definition);
          }
        }

        if (savedViews.size > 0) {
          await dropViews(savedViews);
        }

        for (const spec of columnsToFix) {
          await pool.query(`
            ALTER TABLE ${spec.table}
            ALTER COLUMN ${spec.column} TYPE VARCHAR(${spec.length})
            USING ${spec.column}::text
          `);
          console.log(`✅ [ensureJalaliDateColumns] ${spec.table}.${spec.column} → VARCHAR(${spec.length})`);
        }

        if (savedViews.size > 0) {
          await recreateViews(savedViews);
        }
      } catch (error) {
        ensurePromise = null;
        console.error('❌ [ensureJalaliDateColumns] failed:', error.message);
        if (error.detail) console.error('   detail:', error.detail);
        throw error;
      }
    })();
  }
  return ensurePromise;
}

module.exports = { ensureJalaliDateColumns };
