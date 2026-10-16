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

Publish a new version of files you pulled. `pull` reports the version it downloaded; `push` refuses to publish over a newer version someone else published, unless you pass `--force`:

```bash
otterdrive artifacts pull quarterly-report ./report
otterdrive artifacts push quarterly-report ./report --label "Q3 numbers" --if-version 4
```

Share an artifact or a folder with people, or with anyone who has its link:

```bash
otterdrive artifacts share quarterly-report alex@example.com --role editor
otterdrive folders share Design sam@example.com
otterdrive artifacts link quarterly-report
otterdrive shared
```

Use `otterdrive --help` or `otterdrive <command> --help` for authentication, folders, document commands, and version options.
