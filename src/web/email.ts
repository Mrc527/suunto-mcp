/**
 * The check for email addresses people type to sign up.
 *
 * Stricter than the standards on purpose: an address is shown to administrators (on the admin
 * page and in e-mails about access requests), so it may not contain spaces, line breaks,
 * invisible, control, combining or direction-changing characters, or the characters that make
 * text look like a link or markup (: / ? # < > ( ) [ ] , ; " \). The domain is made of letters,
 * digits and hyphens, with at least two characters after the last dot.
 */

const SHAPE = /^[^@]{1,64}@(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}\p{N}][\p{L}\p{N}-]*[\p{L}\p{N}]$/u;
const UNSAFE = /[\s"(),:;<>[\]\\/?#\p{C}\p{Z}\p{M}\p{Default_Ignorable_Code_Point}]/u;

export function isEmail(value: string): boolean {
  return value.length <= 254 && SHAPE.test(value) && !UNSAFE.test(value);
}
