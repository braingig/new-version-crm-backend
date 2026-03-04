import { GraphQLScalarType } from 'graphql';

export const GraphQLJSON = new GraphQLScalarType({
    name: 'JSON',
    description: 'JSON scalar type',
    serialize(value: any) {
        return value;
    },
    parseValue(value: any) {
        return value;
    },
    parseLiteral(ast) {
        switch (ast.kind) {
            case 'StringValue':
            case 'BooleanValue':
            case 'IntValue':
            case 'FloatValue':
                return (ast as any).value;
            case 'ObjectValue':
                return ast.fields.reduce((acc: any, field) => {
                    acc[field.name.value] = this.parseLiteral(field.value);
                    return acc;
                }, {});
            case 'ListValue':
                return ast.values.map(this.parseLiteral);
            default:
                return null;
        }
    },
});