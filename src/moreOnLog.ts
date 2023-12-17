// It's very dangerous for this file to depend on other files in the same project.
// We should avoid this situation as much as possible.

import type {LogLevelNumbers} from "loglevel";
import * as origLog from "loglevel";

const log2 = origLog.getLogger("rs-default");

const originalFactory = log2.methodFactory;

export const applyLogWriterInplace = function (writer: (...msg: any[]) => any) {
  log2.methodFactory = function (
    methodName: string,
    logLevel: LogLevelNumbers,
    loggerName: string | symbol
  ) {
    // @ts-ignore
    const rawMethod = originalFactory(methodName, logLevel, loggerName);

    return function (...msg: any[]) {
      rawMethod.apply(undefined, msg);
      writer(...msg);
    };
  };

  log2.setLevel(log2.getLevel());
};

export const restoreLogWritterInplace = () => {
  log2.methodFactory = originalFactory;
  log2.setLevel(log2.getLevel());
};

export const log = log2;
