import { Link } from "react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormInput } from "../../../components/form/FormInput"
import { signInSchema, type SignInFormData } from "@/schemas/auth"
import { useSignIn, useGoogleAuth } from "@/hooks/useAuth"
import { getApiError } from "@/lib/axios"

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-4">
    <path
      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
      fill="currentColor"
    />
  </svg>
)

const SignIn = ({ className, ...props }: React.ComponentProps<"div">) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
  })

  const signIn = useSignIn()
  const { login: googleLogin, isPending: isGooglePending } = useGoogleAuth()

  const onSubmit = (data: SignInFormData) => {
    signIn.mutate(data)
  }

  const apiError = signIn.isError ? getApiError(signIn.error) : null

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>Login with your Google account or email</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Google OAuth */}
          <Button
            variant="outline"
            type="button"
            onClick={() => googleLogin()}
            disabled={isGooglePending || signIn.isPending}
          >
            <GoogleIcon />
            {isGooglePending ? "Connecting..." : "Login with Google"}
          </Button>

          <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
            <span className="relative z-10 bg-card px-2 text-muted-foreground">Or continue with</span>
          </div>

          {/* Email/Password form */}
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormInput
              label="Email"
              type="email"
              placeholder="m@example.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register("email")}
            />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <FormInput
                id="password"
                type="password"
                autoComplete="current-password"
                error={errors.password?.message}
                {...register("password")}
              />
            </div>

            {apiError && (
              <p className="text-sm text-destructive text-center">{apiError}</p>
            )}

            <Button type="submit" disabled={signIn.isPending || isGooglePending} className="w-full">
              {signIn.isPending ? "Signing in..." : "Login"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link to="/sign-up" className="underline underline-offset-4 hover:text-primary">
                Sign up
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default SignIn