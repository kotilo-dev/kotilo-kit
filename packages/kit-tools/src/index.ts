import type { Tool } from '@kotilo/kit-core';
import base64 from './encoding/base64.js';
import htmlEntity from './encoding/html-entity.js';
import jwt from './encoding/jwt.js';
import radix from './encoding/radix.js';
import unicode from './encoding/unicode.js';
import url from './encoding/url.js';
import csv from './format/csv.js';
import jsonConvert from './format/json-convert.js';
import jsonTypes from './format/json-types.js';
import json from './format/json.js';
import sql from './format/sql.js';
import xml from './format/xml.js';
import hash from './generate/hash.js';
import password from './generate/password.js';
import uuid from './generate/uuid.js';
import caseTool from './text/case.js';
import count from './text/count.js';
import diff from './text/diff.js';
import escape from './text/escape.js';
import fake from './text/fake.js';
import lines from './text/lines.js';
import regex from './text/regex.js';
import cron from './time/cron.js';
import duration from './time/duration.js';
import timestamp from './time/timestamp.js';
import units from './time/units.js';
import color from './visual/color.js';
import query from './web/query.js';
import urlParse from './web/url-parse.js';

/** All built-in tools, in sidebar order (category, then priority). */
export const builtinTools: Tool<any>[] = [
  base64,
  url,
  jwt,
  htmlEntity,
  radix,
  unicode,
  json,
  jsonConvert,
  csv,
  jsonTypes,
  xml,
  sql,
  caseTool,
  lines,
  diff,
  regex,
  escape,
  fake,
  count,
  timestamp,
  cron,
  duration,
  units,
  uuid,
  hash,
  password,
  urlParse,
  query,
  color,
];

export { base64, url, jwt, htmlEntity, radix, unicode, json, jsonConvert, csv, jsonTypes, xml, sql, caseTool, lines, diff, regex, escape, fake, count, timestamp, cron, duration, units, uuid, hash, password, urlParse, query, color };
