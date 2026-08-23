// Copyright (C) 2026 Fiber
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0. If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.
//
// What you may do:
// - Use this software for any purpose, including commercially, and build and
//   sell your own products on top of it.
// - Change it, and create new works based on it.
// - Distribute copies of it, with or without your changes.
// - Combine it with files under any other licence, proprietary ones included,
//   and licence that larger work on your own terms.
//
// What you must do in return:
// - Keep this notice on every file you received it on.
// - Publish, under these same terms, the source of every file covered by them
//   that you distribute, including the ones you changed, so that whoever
//   receives your version can obtain that source.
// - Leave Fiber out of it: the name "Fiber", its branding, its logos and its
//   trademarks may not be used to endorse or promote what you build, and this
//   licence grants no right to them.
//
// Disclaimer:
// AS FAR AS THE LAW ALLOWS, THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY
// OR CONDITION OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
// NON-INFRINGEMENT. IN NO EVENT SHALL FIBER BE LIABLE FOR ANY DIRECT, INDIRECT,
// INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING BUT NOT
// LIMITED TO LOSS OF USE, DATA, PROFITS, OR BUSINESS INTERRUPTION) ARISING OUT
// OF OR RELATED TO THESE TERMS OR THE USE OR NATURE OF THE SOFTWARE, UNDER ANY
// KIND OF LEGAL CLAIM.
//
// This header is a summary written for convenience. Where it differs from the

export interface InstalledMock {
  restore(): void;
}

export function installMock<T extends object, K extends keyof T>(
  target: T,
  property: K,
  value: T[K],
): InstalledMock {
  const held = Object.getOwnPropertyDescriptor(target, property);

  Object.defineProperty(target, property, {
    value,
    configurable: true,
    writable: true,
    enumerable: held?.enumerable ?? true,
  });

  return _restoring(target, property, held);
}

export function installGetterMock<T extends object, K extends keyof T>(
  target: T,
  property: K,
  get: () => T[K],
): InstalledMock {
  const held = Object.getOwnPropertyDescriptor(target, property);

  Object.defineProperty(target, property, {
    get,
    configurable: true,
    enumerable: held?.enumerable ?? true,
  });

  return _restoring(target, property, held);
}

export function installAllMock<T extends object>(target: T, stand: T): InstalledMock {
  const carried = ["length", "name", "prototype", "constructor"];
  const names = Object.getOwnPropertyNames(target)
    .filter((name) => !carried.includes(name) && !name.startsWith("_"));

  const installed = names.map((name) =>
    installMock(
      target as unknown as Record<string, unknown>,
      name,
      (stand as unknown as Record<string, unknown>)[name],
    )
  );

  return {
    restore(): void {
      for (const one of installed) one.restore();
    },
  };
}

function _restoring<T extends object, K extends keyof T>(
  target: T,
  property: K,
  held: PropertyDescriptor | undefined,
): InstalledMock {
  return {
    restore(): void {
      if (held) Object.defineProperty(target, property, held);
      else delete (target as Record<PropertyKey, unknown>)[property as string];
    },
  };
}
