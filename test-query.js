import { Hono } from 'hono';

const app = new Hono();

app.get('/test', (c) => {
  const search = c.req.query('search');
  const allQuery = c.req.query();
  return c.json({
    search: search,
    searchType: typeof search,
    searchIsUndefined: search === undefined,
    searchIsNull: search === null,
    searchIsEmptyString: search === "",
    allQuery: allQuery,
  });
});

console.log('Test server running on http://localhost:4001');
export default app;
