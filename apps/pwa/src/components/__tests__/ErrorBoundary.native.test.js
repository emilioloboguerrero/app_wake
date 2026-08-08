import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import ErrorBoundary from '../ErrorBoundary';

// errorReporter.reportError schedules a 5s setTimeout to batch-flush to the
// error-ingest Cloud Function. That timer outlives the test (Jest warns
// "did not exit"), so stub it — this test only asserts render behavior.
jest.mock('../../utils/errorReporter', () => ({
  reportError: jest.fn(),
}));

describe('ErrorBoundary (native harness seed)', () => {
  it('renders children when no error occurs', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>contenido visible</Text>
      </ErrorBoundary>
    );
    expect(getByText('contenido visible')).toBeTruthy();
  });

  it('renders fallback instead of children when a child throws', () => {
    const Bomb = () => {
      throw new Error('boom');
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { queryByText } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(queryByText('contenido visible')).toBeNull();
    spy.mockRestore();
  });
});
