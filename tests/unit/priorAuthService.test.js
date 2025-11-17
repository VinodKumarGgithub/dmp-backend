const { priorAuthService } = require('../../services/priorAuthService');

test('priorAuthService.createRule validates payload', async () => {
  const db = { models: { PBM_PriorAuthRules: { create: jest.fn(async (d) => d) } } };
  const payload = { rule_name: 'Rule A', criteria: { drug_code: 'D' } };
  const res = await priorAuthService.createRule(db, payload);
  expect(res.rule_name).toBe('Rule A');
});


