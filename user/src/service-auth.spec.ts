import {
  SERVICE_AUTH_HEADERS,
  signServiceRequest,
  verifyServiceSignature,
} from '@restaurant/geolocation';

describe('service auth', () => {
  beforeEach(() => {
    process.env.SERVICE_AUTH_SECRET = 'test-service-secret';
  });

  it('signs and verifies a service request', () => {
    const headers = signServiceRequest('restaurant', '1700000000000');

    expect(
      verifyServiceSignature(
        headers[SERVICE_AUTH_HEADERS.service],
        headers[SERVICE_AUTH_HEADERS.timestamp],
        headers[SERVICE_AUTH_HEADERS.signature],
        1700000000000,
      ),
    ).toBe(true);
  });

  it('rejects a tampered service name', () => {
    const headers = signServiceRequest('restaurant', '1700000000000');

    expect(
      verifyServiceSignature(
        'payment',
        headers[SERVICE_AUTH_HEADERS.timestamp],
        headers[SERVICE_AUTH_HEADERS.signature],
        1700000000000,
      ),
    ).toBe(false);
  });

  it('rejects a request outside the clock skew window', () => {
    const headers = signServiceRequest('restaurant', '1700000000000');

    expect(
      verifyServiceSignature(
        headers[SERVICE_AUTH_HEADERS.service],
        headers[SERVICE_AUTH_HEADERS.timestamp],
        headers[SERVICE_AUTH_HEADERS.signature],
        1700000000000 + 61_000,
      ),
    ).toBe(false);
  });

  it('rejects missing credentials', () => {
    expect(verifyServiceSignature(undefined, undefined, undefined)).toBe(false);
  });
});
