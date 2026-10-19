# @mops

Field marketing demo. Run `npm start`, open http://localhost:8787/ , and sign in as Maria Alvarez. `/` is Maria's home. `/platform` is the console behind it. `/classic` is the older desk.

## Brand

The company wordmark is the `BRAND_NAME` environment variable. The default is `Northwind`. It is text only. There is no logo.

That name is used in the header, the sign-in page, reports (PowerPoint and PDF), email signatures and footers, registration pages, and the seed lines that record loading the fictional book.

Leave `BRAND_NAME` unset and the wordmark is Northwind. The company line is Northwind Networks. A name that already ends in "Networks" is used as the company line. Any other name gets " Networks" appended.

Mailbox addresses stay on `northwind.example`. That domain is the demo mail host, not the wordmark.

Every account, person, and campaign in the demo is fictional.

```bash
BRAND_NAME=Harborline npm start
```

The value is trimmed, limited to 40 characters, and stripped of control characters and `& < > " '`.
