/**
 * WealthOne API Client
 * Handles all communication with the FastAPI backend.
 */

const API_BASE = 'http://localhost:8000';

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Health
  health: () => request('GET', '/health'),

  // Users
  createUser: (name, email, riskProfile) =>
    request('POST', '/users', { name, email, risk_profile: riskProfile }),

  // Auth
  googleLogin: (token, riskProfile) =>
    request('POST', '/auth/google', { token, risk_profile: riskProfile }),

  // Accounts
  linkAccount: (userId, sourceType, providerName, consentOrFileRef) =>
    request('POST', '/accounts/link', {
      user_id: userId,
      source_type: sourceType,
      provider_name: providerName,
      consent_or_file_ref: consentOrFileRef,
    }),
  listAccounts: (userId) => request('GET', `/accounts/${userId}`),
  resyncAccount: (accountId) => request('POST', `/accounts/${accountId}/resync`),
  unlinkAccount: (accountId) => request('DELETE', `/accounts/${accountId}`),

  // Portfolio
  getPortfolio: (userId) => request('GET', `/portfolio/${userId}/consolidated`),
  getRiskInsights: (userId) => request('GET', `/portfolio/${userId}/risk-insights`),

  // Goals
  listGoals: (userId) => request('GET', `/goals/${userId}`),
  createGoal: (userId, name, targetAmount, targetDate) =>
    request('POST', '/goals', {
      user_id: userId,
      name,
      target_amount: targetAmount,
      target_date: targetDate,
    }),
  deleteGoal: (goalId) => request('DELETE', `/goals/${goalId}`),

  // Recommendations
  getRecommendations: (userId) => request('GET', `/recommendations/${userId}`),

  // AI Chatbot (Grok)
  chatWithAI: (message, history = []) =>
    request('POST', '/chat', { message, history }),
};

