async function testFix() {
    const url = 'http://localhost:9000/api/v1/auth/license-found';
    const payload = {
        clientId: " CLT-20260225-8BA16A" // Leading space as reported by user
    };

    try {
        console.log(`Sending request to ${url} with payload:`, JSON.stringify(payload));
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('Response Status:', response.status);
        console.log('Response Data:', JSON.stringify(data, null, 2));

        if (data.success && data.data.clientId === "CLT-20260225-8BA16A") {
            console.log('✅ Verification successful! The backend correctly trimmed the clientId.');
        } else {
            console.log('❌ Verification failed. Response was successful but data might be unexpected.');
        }
    } catch (error) {
        console.error('❌ Verification failed with error:');
        console.error(error);
    }
}

testFix();
