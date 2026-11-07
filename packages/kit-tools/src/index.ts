import type { Tool } from '@kotilo/kit-core';
import base64 from './encoding/base64.js';
import htmlEntity from './encoding/html-entity.js';
import jwt from './encoding/jwt.js';
import url from './encoding/url.js';
import csv from './format/csv.js';
import jsonConvert from './format/json-convert.js';
import json from './format/json.js';
import hash from './generate/hash.js';
import uuid from './generate/uuid.js';
import caseTool from './text/case.js';
import diff from './text/diff.js';
import lines from './text/lines.js';
import regex from './text/regex.js';
import cron from './time/cron.js';
import timestamp from './time/timestamp.js';
import color from './visual/color.js';
import urlParse from './web/url-parse.js';

/** All built-in tools, in sidebar order (category, then priority). */
export const builtinTools: Tool<any>[] = [
  base64,
  url,
  jwt,
  htmlEntity,
  json,
  jsonConvert,
  csv,
  caseTool,
  lines,
  diff,
  regex,
  timestamp,
  cron,
  uuid,
  hash,
  urlParse,
  color,
];

export { base64, url, jwt, htmlEntity, json, jsonConvert, csv, caseTool, lines, diff, regex, timestamp, cron, uuid, hash, urlParse, color };
