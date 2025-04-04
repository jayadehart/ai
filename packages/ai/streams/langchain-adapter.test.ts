import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
  convertResponseStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createDataStream } from '../core/data-stream/create-data-stream';
import {
  mergeIntoDataStream,
  toDataStream,
  toDataStreamResponse,
} from './langchain-adapter';

describe('toDataStream', () => {
  it('should convert ReadableStream<LangChainAIMessageChunk>', async () => {
    const inputStream = convertArrayToReadableStream([
      { content: 'Hello' },
      { content: [{ type: 'text', text: 'World' }] },
    ]);

    assert.deepStrictEqual(
      await convertReadableStreamToArray(
        toDataStream(inputStream).pipeThrough(new TextDecoderStream()),
      ),
      ['0:"Hello"\n', '0:"World"\n'],
    );
  });

  it('should convert ReadableStream<string> (LangChain StringOutputParser)', async () => {
    const inputStream = convertArrayToReadableStream(['Hello', 'World']);

    assert.deepStrictEqual(
      await convertReadableStreamToArray(
        toDataStream(inputStream).pipeThrough(new TextDecoderStream()),
      ),
      ['0:"Hello"\n', '0:"World"\n'],
    );
  });

  it('should convert ReadableStream<LangChainStreamEvent>', async () => {
    const inputStream = convertArrayToReadableStream([
      { event: 'on_chat_model_stream', data: { chunk: { content: 'Hello' } } },
      { event: 'on_chat_model_stream', data: { chunk: { content: 'World' } } },
    ]);

    assert.deepStrictEqual(
      await convertReadableStreamToArray(
        toDataStream(inputStream).pipeThrough(new TextDecoderStream()),
      ),
      ['0:"Hello"\n', '0:"World"\n'],
    );
  });
});

describe('toDataStreamResponse', () => {
  it('should convert ReadableStream<LangChainAIMessageChunk>', async () => {
    const inputStream = convertArrayToReadableStream([
      { content: 'Hello' },
      { content: [{ type: 'text', text: 'World' }] },
    ]);

    const response = toDataStreamResponse(inputStream);

    assert.strictEqual(response.status, 200);

    assert.deepStrictEqual(Object.fromEntries(response.headers.entries()), {
      'content-type': 'text/plain; charset=utf-8',
      'x-vercel-ai-data-stream': 'v1',
    });

    assert.strictEqual(
      response.headers.get('Content-Type'),
      'text/plain; charset=utf-8',
    );

    assert.deepStrictEqual(await convertResponseStreamToArray(response), [
      '0:"Hello"\n',
      '0:"World"\n',
    ]);
  });

  it('should merge options.data into the response stream', async () => {
    const inputStream = convertArrayToReadableStream([
      { event: 'on_chat_model_stream', data: { chunk: { content: 'Hello' } } },
      { event: 'on_chat_model_stream', data: { chunk: { content: 'World' } } },
    ]);

    const dataStream = createDataStream({
      execute(writer) {
        writer.writeData({ metadata: 'Custom metadata' });
      },
    });

    const response = toDataStreamResponse(inputStream, { data: dataStream });
    assert.deepStrictEqual(await convertResponseStreamToArray(response), [
      '2:[{"metadata":"Custom metadata"}]\n',
      '0:"Hello"\n',
      '0:"World"\n',
    ]);
  });
});

describe('mergeIntoDataStream', () => {
  it('should merge LangChain stream into existing data stream', async () => {
    const inputStream = convertArrayToReadableStream([
      { content: 'Hello' },
      { content: ', ' },
      { content: 'world!' },
    ]);

    const dataStream = createDataStream({
      execute(writer) {
        // First write some existing data
        writer.writeData('stream-data-value');

        // Then merge in the LangChain stream
        mergeIntoDataStream(inputStream, { dataStream: writer });
      },
    });

    assert.deepStrictEqual(await convertReadableStreamToArray(dataStream), [
      '2:["stream-data-value"]\n',
      '0:"Hello"\n',
      '0:", "\n',
      '0:"world!"\n',
    ]);
  });

  it('should support callbacks while merging', async () => {
    const inputStream = convertArrayToReadableStream([
      { content: 'Hello' },
      { content: 'World' },
    ]);

    const callbacks = {
      onText: vi.fn(),
    };

    const dataStream = createDataStream({
      execute(writer) {
        mergeIntoDataStream(inputStream, {
          dataStream: writer,
          callbacks,
        });
      },
    });

    await convertReadableStreamToArray(dataStream);

    expect(callbacks.onText).toHaveBeenCalledTimes(2);
    expect(callbacks.onText).toHaveBeenNthCalledWith(1, 'Hello');
    expect(callbacks.onText).toHaveBeenNthCalledWith(2, 'World');
  });
});
