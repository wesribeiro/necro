'use strict';

const { executeCommand } = require('../main/executor');

/**
 * Encapsula a execução de scripts PowerShell.
 * @param {string}   scriptPath - Caminho completo para o .ps1
 * @param {string[]} args       - Argumentos adicionais
 */
async function runScript(scriptPath, args = []) {
  return executeCommand('powershell', [
    '-ExecutionPolicy', 'Bypass',
    '-File',            scriptPath,
    ...args,
  ]);
}

module.exports = { runScript };
