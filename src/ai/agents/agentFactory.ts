import Ajv, { type JSONSchemaType } from 'ajv';
import { generateJson } from '../llmGateway';

const ajv = new Ajv({ allErrors: true });

export interface AgentDefinition<Input, Output> {
    name: string;
    prompt: (input: Input) => string;
    schema: JSONSchemaType<Output>;
}

export function createAgent<Input, Output>(definition: AgentDefinition<Input, Output>) {
    const validate = ajv.compile(definition.schema);

    return {
        async run(input: Input): Promise<Output> {
            const output = await generateJson<unknown>(definition.prompt(input));
            if (!validate(output)) {
                throw new Error(
                    `[${definition.name}] output did not match its schema: ${ajv.errorsText(validate.errors)}`,
                );
            }
            return output;
        },
    };
}
