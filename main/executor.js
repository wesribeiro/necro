'use strict';

const { spawn } = require('child_process');
const path      = require('path');

/**
 * Executa um comando externo e retorna stdout/stderr como string.
 *
 * @param {string}   command  - Executável (ex: 'powershell')
 * @param {string[]} args     - Argumentos
 * @param {object}   options  - Opções extras do spawn (inclui `cwd` para definir o
 *                              Working Directory do processo filho — OBRIGATÓRIO para
 *                              aplicativos que usam caminhos relativos como \Install).
 * @returns {Promise<{success: boolean, output: string, error: string, exitCode: number}>}
 */
function executeCommand(command, args = [], options = {}) {
  return new Promise((resolve) => {
    // Se `cwd` não for passado explicitamente, usa o diretório do próprio executável
    // quando `command` for um caminho absoluto, evitando herdar o CWD do NECRO.
    const defaultCwd  = path.isAbsolute(command) ? path.dirname(command) : undefined;
    const defaultOpts = { windowsHide: true, cwd: defaultCwd, ...options };
    const proc = spawn(command, args, defaultOpts);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (exitCode) => {
      resolve({
        success:  exitCode === 0,
        output:   stdout.trim(),
        error:    stderr.trim(),
        exitCode: exitCode ?? -1,
      });
    });

    proc.on('error', (err) => {
      resolve({
        success:  false,
        output:   '',
        error:    err.message,
        exitCode: -1,
      });
    });
  });
}

module.exports = { executeCommand };
