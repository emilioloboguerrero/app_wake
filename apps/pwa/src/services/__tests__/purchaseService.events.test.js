import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../analyticsService', () => ({ default: { track: vi.fn() } }));
vi.mock('../../utils/apiClient', () => ({ default: { post: vi.fn(), get: vi.fn() } }));

import analyticsService from '../analyticsService';
import apiClient from '../../utils/apiClient';
import purchaseService from '../purchaseService';

describe('purchaseService subscription checkout events', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('prepareBundleSubscription', () => {
    it('fires checkout.created on success', async () => {
      apiClient.post.mockResolvedValueOnce({
        data: { init_point: 'https://mp/x', subscription_id: 'sub1' },
      });
      const result = await purchaseService.prepareBundleSubscription('b1', 'a@b.com', 'pwa_web');
      expect(result.success).toBe(true);
      expect(analyticsService.track).toHaveBeenCalledWith(
        'subscription.checkout.created',
        expect.objectContaining({
          bundle_id: 'b1',
          surface: 'pwa_web',
          kind: 'bundle',
          subscription_id: 'sub1',
        })
      );
    });

    it('fires checkout.create_failed on error', async () => {
      apiClient.post.mockRejectedValueOnce(new Error('boom'));
      const result = await purchaseService.prepareBundleSubscription('b1', 'a@b.com', 'pwa_web');
      expect(result.success).toBe(false);
      expect(analyticsService.track).toHaveBeenCalledWith(
        'subscription.checkout.create_failed',
        expect.objectContaining({
          bundle_id: 'b1',
          surface: 'pwa_web',
          kind: 'bundle',
        })
      );
    });
  });

  describe('prepareSubscription (course)', () => {
    it('fires checkout.created on success', async () => {
      apiClient.post.mockResolvedValueOnce({
        data: { init_point: 'https://mp/y', subscription_id: 'sub2' },
      });
      const result = await purchaseService.prepareSubscription('u1', 'c1', 'a@b.com', 'pwa_web');
      expect(result.success).toBe(true);
      expect(analyticsService.track).toHaveBeenCalledWith(
        'subscription.checkout.created',
        expect.objectContaining({
          course_id: 'c1',
          surface: 'pwa_web',
          kind: 'course',
          subscription_id: 'sub2',
        })
      );
    });

    it('fires checkout.create_failed on error', async () => {
      apiClient.post.mockRejectedValueOnce(new Error('boom'));
      const result = await purchaseService.prepareSubscription('u1', 'c1', 'a@b.com', 'pwa_web');
      expect(result.success).toBe(false);
      expect(analyticsService.track).toHaveBeenCalledWith(
        'subscription.checkout.create_failed',
        expect.objectContaining({
          course_id: 'c1',
          surface: 'pwa_web',
          kind: 'course',
        })
      );
    });
  });
});
