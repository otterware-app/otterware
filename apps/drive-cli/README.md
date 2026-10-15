# Otter Drive CLI

```bash
npm install --global otterdrive
otterdrive auth login
otterdrive artifacts --help
```

Publish a website directory or a single Markdown, CSV, TSV, or Excel workbook file. Otter Drive detects the entry file and the web app provides a dedicated document preview:

```bash
otterdrive artifacts create ./report.xlsx \
  --slug quarterly-report \
  --title "Quarterly report"
```

Share an artifact or a folder with people, or with anyone who has its link:

```bash
otterdrive artifacts share quarterly-report alex@example.com --role editor
otterdrive folders share Design sam@example.com
otterdrive artifacts link quarterly-report
otterdrive shared
```

Use `otterdrive --help` or `otterdrive <command> --help` for authentication, folders, document commands, and version options.
