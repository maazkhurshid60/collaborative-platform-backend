
class ApiError extends Error {
    statusCode: number
    data: null
    success: boolean
    errors: string[]
    constructor(
        statusCode: number,
        message = "Something Went Wrong",
        errors = [],
        stack = ""
    ) {
        super(message)
        this.statusCode = statusCode
        this.data = null
        this.message = message
        this.success = false
        this.errors = errors

        if (stack) {
            this.stack = stack
        } else {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}



class AppError extends Error {
    statusCode: number;
    status: string;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
        this.status = statusCode < 400 ? "success" : "error";
        Error.captureStackTrace(this, this.constructor);
    }
}


export { ApiError, AppError }
