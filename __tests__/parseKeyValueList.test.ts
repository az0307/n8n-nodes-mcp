import { parseKeyValueList } from '../nodes/McpClient/McpClient.node';

describe('parseKeyValueList', () => {
	it('parses comma-separated pairs', () => {
		expect(parseKeyValueList('A=1,B=2')).toEqual({ A: '1', B: '2' });
	});
	it('parses newline-separated pairs and keeps commas in values', () => {
		expect(parseKeyValueList('A=1,2\nB=x=y')).toEqual({ A: '1,2', B: 'x=y' });
	});
	it('ignores malformed lines', () => {
		expect(parseKeyValueList('=x\nnoeq\n')).toEqual({});
	});
});
