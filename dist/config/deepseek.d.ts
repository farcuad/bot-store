export declare const tools: ({
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                producto?: never;
                cantidad?: never;
            };
            required?: never;
        };
    };
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                producto: {
                    type: string;
                    description: string;
                };
                cantidad?: never;
            };
            required: string[];
        };
    };
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                producto: {
                    type: string;
                    description?: never;
                };
                cantidad: {
                    type: string;
                };
            };
            required: string[];
        };
    };
})[];
export declare const llamarDeepseek: (messages: any[]) => Promise<any>;
//# sourceMappingURL=deepseek.d.ts.map