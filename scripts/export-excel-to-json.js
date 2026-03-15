const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const filePath = path.join(__dirname, "..", "cần xử lý.xlsx");
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

// Row 1 = section headers, Row 2 = sub-headers. Data from row 5 onwards.
const subHeaders = (data[2] || []).map((h) =>
  String(h).replace(/\r\n/g, " ").trim(),
);
const outDir = path.join(__dirname, "..", "src", "data");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const rows = [];
for (let r = 5; r < data.length; r++) {
  const row = data[r];
  if (!row || row.length === 0) continue;
  const obj = {};
  for (let c = 0; c < Math.max(subHeaders.length, row.length); c++) {
    const key = `col_${c}`;
    let val = row[c];
    if (val === undefined || val === "") val = null;
    else if (typeof val === "number" && val > 40000 && val < 50000) {
      const d = XLSX.SSF.parse_date_code(val);
      if (d)
        val = `${String(d.y)}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
    obj[key] = val;
  }
  rows.push(obj);
}

const columns = subHeaders.map((h, i) => ({
  key: `col_${i}`,
  label: (h || `Col ${i}`).trim(),
}));
fs.writeFileSync(
  path.join(outDir, "excel-columns.json"),
  JSON.stringify(columns, null, 2),
  "utf8",
);
fs.writeFileSync(
  path.join(outDir, "excel-rows.json"),
  JSON.stringify(rows, null, 0),
  "utf8",
);
console.log("Exported", rows.length, "rows,", columns.length, "columns.");
