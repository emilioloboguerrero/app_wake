'use strict';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

class Reporter {
  constructor() {
    this.results = []; // { suite, test, passed, error, elapsed }
    this.currentSuite = null;
  }

  startSuite(name) {
    this.currentSuite = name;
    console.log(`\n${BOLD}${YELLOW}▸ ${name}${RESET}`);
  }

  pass(label, elapsed) {
    this.results.push({ suite: this.currentSuite, test: label, passed: true, elapsed });
    const ms = elapsed ? ` ${DIM}(${elapsed}ms)${RESET}` : '';
    console.log(`  ${GREEN}✓${RESET} ${label}${ms}`);
  }

  fail(label, error, elapsed) {
    this.results.push({ suite: this.currentSuite, test: label, passed: false, error: error.message, elapsed });
    const ms = elapsed ? ` ${DIM}(${elapsed}ms)${RESET}` : '';
    console.log(`  ${RED}✗${RESET} ${label}${ms}`);
    // Indent error message
    const lines = error.message.split('\n');
    for (const line of lines.slice(0, 6)) {
      console.log(`    ${DIM}${line}${RESET}`);
    }
  }

  summary() {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;
    const totalElapsed = this.results.reduce((sum, r) => sum + (r.elapsed || 0), 0);

    console.log(`\n${BOLD}${'─'.repeat(50)}${RESET}`);

    if (failed === 0) {
      console.log(`${GREEN}${BOLD}All ${total} tests passed${RESET} ${DIM}(${totalElapsed}ms)${RESET}`);
    } else {
      console.log(`${RED}${BOLD}${failed} of ${total} tests failed${RESET} ${DIM}(${totalElapsed}ms)${RESET}`);
      console.log(`\n${RED}Failed tests:${RESET}`);
      for (const r of this.results.filter(r => !r.passed)) {
        console.log(`  ${RED}✗${RESET} [${r.suite}] ${r.test}`);
        if (r.error) {
          console.log(`    ${DIM}${r.error.split('\n')[0]}${RESET}`);
        }
      }
    }

    // Per-suite summary table
    const suites = [...new Set(this.results.map(r => r.suite))];
    console.log(`\n${BOLD}Suite results:${RESET}`);
    for (const suite of suites) {
      const suiteResults = this.results.filter(r => r.suite === suite);
      const sp = suiteResults.filter(r => r.passed).length;
      const sf = suiteResults.filter(r => !r.passed).length;
      const icon = sf === 0 ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
      console.log(`  ${icon} ${suite}: ${sp}/${suiteResults.length} passed`);
    }

    console.log('');
    return failed === 0;
  }
}

module.exports = { Reporter };
