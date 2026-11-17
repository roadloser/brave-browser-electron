# 固定算法与数据来源

Randen映射依据Abseil commit 8fb4507d10a24a1204e98f77ad19c27c291e13e9的randen_engine.h、randen_slow.cc、randen_traits.h与randen_round_keys.cc。
randen-tables.ts的AES lookup数值、randen-keys.ts的固定Pi round key字节源自该版本。

原始版权声明：Copyright 2017 The Abseil Authors.
原始许可：Apache License, Version 2.0，https://www.apache.org/licenses/LICENSE-2.0 。
原始来源：https://github.com/abseil/abseil-cpp/tree/8fb4507d10a24a1204e98f77ad19c27c291e13e9/absl/random/internal 。

此处TS实现保持固定状态、端序、AES轮、shuffle和feed-forward语义。未运行官方向量，不表示已验证密码学或Brave行为等效。
HMAC-SHA256消费@noble/hashes，不自行实现哈希算法。Brave公式来源为brave_session_cache.cc，原项目MPL-2.0。
