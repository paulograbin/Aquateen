(function (scope) {
  'use strict';

  // Names match the recovered AVM1 opcodes; the extractor has resolved constant pools.
  const operations = {
    End: execution => { execution.finished = true; },
    ConstantPool: () => {},
    Push: (execution, values) => execution.stack.push(...values),
    Pop: execution => execution.stack.pop(),
    GetVariable: execution => execution.readVariable(),
    SetVariable: execution => execution.writeVariable(),
    GetMember: execution => execution.readMember(),
    SetMember: execution => execution.writeMember(),
    RandomNumber: execution => execution.randomNumber(),
    Increment: execution => execution.unary(value => Number(value) + 1),
    Decrement: execution => execution.unary(value => Number(value) - 1),
    Not: execution => execution.unary(value => !value),
    Add2: execution => execution.binary((left, right) => left + right),
    Less2: execution => execution.binary((left, right) => left < right),
    Greater: execution => execution.binary((left, right) => left > right),
    If: (execution, branch) => { if (execution.stack.pop()) execution.jump(branch.target); },
    Jump: (execution, branch) => execution.jump(branch.target),
    GotoFrame: (execution, frame) => execution.engine.goToFrame(execution.target, frame),
    Stop: execution => { execution.target.playing = false; },
    Play: execution => { execution.target.playing = true; },
    CallMethod: execution => execution.callMethod(),
  };

  class ActionExecution {
    constructor(engine, target, instructions) {
      this.engine = engine;
      this.target = target;
      this.instructions = instructions;
      this.instructionIndexByOffset = new Map(instructions.map((instruction, index) => [instruction.offset, index]));
      this.stack = [];
      this.instructionIndex = 0;
      this.finished = false;
    }

    run() {
      let remainingInstructions = 10000;
      while (!this.finished && this.instructionIndex < this.instructions.length) {
        if (remainingInstructions-- <= 0) throw new Error('Action instruction budget exhausted');
        this.execute(this.instructions[this.instructionIndex++]);
      }
    }

    execute(instruction) {
      const operation = Object.hasOwn(operations, instruction.op) && operations[instruction.op];
      if (!operation) throw new Error('Unsupported recovered opcode ' + instruction.op);
      operation(this, instruction.arg);
    }

    jump(offset) {
      this.instructionIndex = this.instructionIndexByOffset.get(offset) ?? this.instructions.length;
    }

    unary(operation) {
      this.stack.push(operation(this.stack.pop()));
    }

    binary(operation) {
      const right = this.stack.pop();
      const left = this.stack.pop();
      this.stack.push(operation(left, right));
    }

    readVariable() {
      const name = this.stack.pop();
      this.stack.push(this.engine.resolveVariable(this.target, name));
    }

    writeVariable() {
      const value = this.stack.pop();
      const name = this.stack.pop();
      this.target.set(name, value);
    }

    readMember() {
      const name = this.stack.pop();
      const object = this.stack.pop();
      this.stack.push(this.engine.readProperty(object, name));
    }

    writeMember() {
      const value = this.stack.pop();
      const name = this.stack.pop();
      const object = this.stack.pop();
      this.engine.writeProperty(object, name, value);
    }

    randomNumber() {
      const upperBound = Number(this.stack.pop());
      this.stack.push(Math.floor(this.engine.random() * upperBound));
    }

    callMethod() {
      const name = this.stack.pop();
      const receiver = this.stack.pop();
      const argumentCount = Number(this.stack.pop());
      const args = Array.from({ length: argumentCount }, () => this.stack.pop());
      const result = typeof receiver?.[name] === 'function' ? receiver[name](...args) : undefined;
      this.stack.push(result);
    }
  }

  function runActions(engine, target, instructions) {
    new ActionExecution(engine, target, instructions).run();
  }

  const exports = { runActions };
  Object.assign(scope.Aquateen ||= {}, exports);
  if (typeof module !== 'undefined') module.exports = exports;
})(typeof window === 'undefined' ? globalThis : window);
