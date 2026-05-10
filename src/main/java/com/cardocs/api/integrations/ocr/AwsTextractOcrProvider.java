package com.cardocs.api.integrations.ocr;

import com.cardocs.api.common.BadRequestException;
import com.cardocs.api.documents.VehicleDocument;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "cardocs.providers", name = "ocr", havingValue = "textract")
public class AwsTextractOcrProvider implements OcrProvider {

    @Override
    public OcrResult process(VehicleDocument document) {
        throw new BadRequestException("AWS Textract está preparado como contrato futuro e desativado no MVP");
    }
}
