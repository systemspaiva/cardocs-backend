package com.cardocs.api.users;

import com.cardocs.api.common.ResourceNotFoundException;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public User getActiveUser(UUID userId) {
        return userRepository.findById(userId)
            .filter(user -> !user.isDeleted())
            .filter(user -> user.getStatus() == UserStatus.ACTIVE)
            .orElseThrow(() -> new ResourceNotFoundException("Usuário não encontrado"));
    }
}
