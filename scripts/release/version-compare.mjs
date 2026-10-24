#!/usr/bin/env node
const [left, right] = process.argv.slice(2);
const semver = (value) => value.split('.').map(Number);
const [leftMajor, leftMinor, leftPatch] = semver(left);
const [rightMajor, rightMinor, rightPatch] = semver(right);
const comparison = leftMajor !== rightMajor
  ? leftMajor - rightMajor
  : leftMinor !== rightMinor
    ? leftMinor - rightMinor
    : leftPatch - rightPatch;
console.log(comparison <= 0 ? 'true' : 'false');
