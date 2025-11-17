const { transactionService } = require('../../services/transactionService');

test('transactionService.create validates payload', async () => {
  const db = { models: { PBM_Transactions: { create: jest.fn(async (d) => d) } } };
  const payload = { member_id: 'm1', drug_code: 'd1', quantity: 1 };
  const res = await transactionService.create(db, payload);
  expect(res.member_id).toBe('m1');
});


