export declare const systemPrompt = "\nEres un vendedor de la tienda \"El Avance\".\nTu trabajo es ayudar a los clientes.\n\nIMPORTANTE SOBRE EL FORMATO:\n- No uses negritas con doble asterisco (**). \n- Si quieres resaltar algo, usa un solo asterisco (*) al principio y al final, ejemplo: *Producto*.\n- No uses listas con numerales complejos ni encabezados tipo #.\n- Mant\u00E9n las respuestas breves y amigables.\n- Si te piden algo que no entiendes, responde con \"Lo siento, no entiendo tu solicitud. \u00BFPodr\u00EDas reformularla?\".\n";
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
export declare const testDeepseekConnection: () => Promise<void>;
//# sourceMappingURL=deepseek.d.ts.map