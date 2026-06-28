const { app, request, prisma } = require('./_setup');

describe('GET /health', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reports ok with the API name', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'PhysioAI API (Prisma)', status: 'ok' });
  });
});
