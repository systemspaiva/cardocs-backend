package com.cardocs.api.sharelinks;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/public/share-links")
public class PublicShareLinkController {

    private final ShareLinkService shareLinkService;

    @GetMapping("/{token}")
    PublicShareLinkResponse publicView(@PathVariable String token) {
        return shareLinkService.publicView(token);
    }
}
