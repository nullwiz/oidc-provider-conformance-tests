const assert = require('assert');
const path = require('path');
const url = require('url');
const _ = require('lodash');
const got = require('got');

const {
  ISSUER = 'https://guarded-cliffs-8635.herokuapp.com',
  TEST_PORT = 60917,
  TEST_HOSTNAME = 'op.certification.openid.net',
  TEST_PROTOCOL = 'https',
} = process.env;

function testUrl(pathname, { protocol = TEST_PROTOCOL, port = TEST_PORT, hostname = TEST_HOSTNAME } = {}) {
  return url.format({ protocol, port, hostname, pathname });
}

async function clearCookies(resource = `${ISSUER}/.well-known/openid-configuration`) {
  await page.open(resource);
  await page.clearCookies();
}

function passed(test) {
  const selector = `a[href="${testUrl(test)}"] > img[alt=Green]`;
  const fn = Function(`return !!document.querySelector('${selector}')`);
  return page.evaluate(fn);
}

function navigation() {
  return new Promise((resolve) => {
    page.on('onLoadFinished', async function () {
      if ((await page.property('content')).includes('document.forms[0].submit()')) {
        return; // wait for the next onLoadFinished on resubmittions
      }
      await page.off('onLoadFinished');
      resolve();
    });
  });
}

async function proceed() {
  const nav = navigation();
  await page.evaluate(function () {
    document.querySelector('a[href*=continue]').click();
  });
  await nav;
}

async function login(loginValue = 'foo', passwordValue = 'bar') {
  const fn = Function(`
    if (document.forms[0].login) document.forms[0].login.value = '${loginValue}';
    if (document.forms[0].password) document.forms[0].password.value = '${passwordValue}';
    document.forms[0].submit();
  `);
  const nav = navigation();
  await page.evaluate(fn);
  await nav;
}

async function nointeraction() {
  const test = this.test.title;
  const nav = navigation();
  await page.open(testUrl(test));
  await nav;
  assert(await passed(test));
}

async function captureError() {
  const test = this.test.title;
  await page.open(testUrl(test));
  await proceed();
  await page.render(`${test}.png`);
}

async function regular() {
  const test = this.test.title;
  await page.open(testUrl(test));

  await login();
  assert(await passed(test));
}

async function clearCaptureView() {
  const test = this.test.title;
  await clearCookies();
  await page.open(testUrl(test));
  await proceed();
  await page.render(`${test}.png`);
  await login();

  assert(await passed(test));
}

async function restart(profile = global.profile) {
  await got.post(testUrl('restart_test_instance', { port: 60000 }), {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      issuer: ISSUER,
      instance_id: 'Test',
    }),
  });
  return got.post(testUrl('profile'), {
    body: profile,
  });
}

async function runSuite(rtype) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  global.profile = {
    rtype,
    encryption: 'on',
    none: 'on',
    signing: 'on',
    extra: 'on',
  };
  const { body } = await restart();

  const mocha = path.join(process.cwd(), 'node_modules', '.bin', '_mocha');
  const args = [mocha];
  args.push('--bail');
  args.push('--async-only');
  args.push('--timeout');
  args.push('60000');

  args.push('test/wrap.js');

  body.match(/\(OP-[a-zA-Z+-_]+\)/g).forEach((test) => {
    const [folder, ...file] = test.slice(4, -1).split('-');
    args.push(`test/${_.snakeCase(folder)}/${_.snakeCase(file)}.js`);
  });

  args.unshift(process.argv[0]);

  process.argv = args;

  require(mocha); //eslint-disable-line
}

module.exports = {
  captureError,
  clearCaptureView,
  clearCookies,
  login,
  navigation,
  nointeraction,
  passed,
  proceed,
  regular,
  restart,
  runSuite,
  testUrl,
};

// await page.property('viewportSize', { width: 800, height: 600 });
